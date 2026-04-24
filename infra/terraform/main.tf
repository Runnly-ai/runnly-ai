resource "azurerm_resource_group" "this" {
  name     = "${var.project_name}-${var.environment}-rg"
  location = var.location
}

locals {
  storage_account_name = substr(lower(replace(replace("${var.project_name}${var.environment}data", "-", ""), "_", "")), 0, 24)
}

resource "azurerm_static_web_app" "ui" {
  name               = "${var.project_name}-${var.environment}-ui"
  resource_group_name = azurerm_resource_group.this.name
  location           = var.location
  sku_tier           = var.static_web_app_sku
  sku_size           = var.static_web_app_sku
}

resource "azurerm_storage_account" "appdata" {
  name                     = local.storage_account_name
  resource_group_name      = azurerm_resource_group.this.name
  location                 = azurerm_resource_group.this.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_servicebus_namespace" "bus" {
  name                = "${var.project_name}-${var.environment}-sb"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "Basic"
}

resource "azurerm_eventgrid_topic" "events" {
  name                = "${var.project_name}-${var.environment}-events"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
}
