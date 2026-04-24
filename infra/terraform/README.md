# Terraform

This directory contains the initial Azure infrastructure layout for the demo.

Current resources:
- Resource group
- Azure Static Web App
- Storage account placeholder for app data
- Service Bus namespace
- Event Grid topic

This first pass is intentionally small. The current TypeScript backend is not yet mapped to an Azure Functions deployment model, so the infrastructure here focuses on the cloud-facing foundation and CI/CD scaffolding.

Notes:
- The GitHub Actions workflow currently validates Terraform but does not apply it.
- The Static Web App resource will need Azure authentication wiring before first apply.

Usage:
- run `terraform init` from this directory
- provide `project_name` and `github_repository`
- optionally set `location` and `environment`
