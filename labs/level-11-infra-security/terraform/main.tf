# Part B: infrastructure as code against your local Docker, so nothing costs money.
# The same workflow (init, plan, apply, drift, destroy) applies unchanged to cloud providers.
terraform {
  required_version = ">= 1.6"
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}

provider "docker" {}   # talks to the Docker daemon from DOCKER_HOST or the default socket

resource "docker_network" "lab" {
  name = "tf-lab"
}

# Built outside Terraform, the way CI builds images: docker build -t lab-api:1 ../app
data "docker_image" "app" {
  name = "lab-api:1"
}

resource "docker_container" "app" {
  count   = var.app_count
  name    = "tf-api-${count.index}"
  image   = data.docker_image.app.id
  restart = "unless-stopped"
  env = [
    "POD_NAME=tf-api-${count.index}",
    "API_KEY=${var.api_key}", # the app ignores it; it is here to show where secrets end up (step B5)
  ]
  networks_advanced {
    name = docker_network.lab.name
  }
  # Created is not the same as ready. Wait until the app answers before Terraform moves on to the
  # proxy; otherwise nginx starts first, finds no live backends and returns 502 for a while.
  healthcheck {
    test     = ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=1)"]
    interval = "2s"
    timeout  = "2s"
    retries  = 15
  }
  wait = true
}

resource "docker_image" "nginx" {
  name         = "nginx:1.27-alpine"
  keep_locally = true # do not delete the image on destroy
}

resource "docker_container" "proxy" {
  name    = "tf-proxy"
  image   = docker_image.nginx.image_id
  restart = "unless-stopped"
  ports {
    internal = 80
    external = var.proxy_port
    ip       = "127.0.0.1"
  }
  networks_advanced {
    name = docker_network.lab.name
  }
  # The nginx config is generated from the list of app containers, so scaling the app updates it.
  upload {
    file    = "/etc/nginx/conf.d/default.conf"
    content = templatefile("${path.module}/nginx.conf.tftpl", { backends = docker_container.app[*].name })
  }
}
