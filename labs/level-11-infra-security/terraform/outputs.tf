output "url" {
  value = "http://localhost:${var.proxy_port}/"
}

output "app_containers" {
  value = docker_container.app[*].name
}
