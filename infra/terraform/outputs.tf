output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "static_web_app_default_host_name" {
  value = azurerm_static_web_app.ui.default_host_name
}

output "servicebus_namespace_id" {
  value = azurerm_servicebus_namespace.bus.id
}

output "eventgrid_topic_endpoint" {
  value = azurerm_eventgrid_topic.events.endpoint
}
