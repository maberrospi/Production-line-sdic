variable "app_count" {
  description = "How many app containers to run behind the proxy"
  type        = number
  default     = 2
  validation {
    condition     = var.app_count >= 1 && var.app_count <= 5
    error_message = "app_count must be between 1 and 5."
  }
}

variable "proxy_port" {
  description = "Port on 127.0.0.1 for the proxy"
  type        = number
  default     = 8088
}

variable "api_key" {
  description = "A pretend secret. Pass it as TF_VAR_api_key; never write it in a .tf file."
  type        = string
  sensitive   = true
}
