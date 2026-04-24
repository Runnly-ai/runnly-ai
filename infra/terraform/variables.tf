variable "project_name" {
  type        = string
  description = "Short project name used for Azure resource naming."
}

variable "location" {
  type        = string
  description = "Azure region."
  default     = "eastus"
}

variable "environment" {
  type        = string
  description = "Deployment environment name."
  default     = "demo"
}

variable "github_repository" {
  type        = string
  description = "GitHub repository in org/name format."
}

variable "static_web_app_sku" {
  type        = string
  description = "Static Web App SKU."
  default     = "Free"
}
