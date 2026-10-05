variable "REGISTRY" {
  default = "local"
}

variable "TAG" {
  default = "dev"
}

variable "WEB_REPOSITORY" {
  default = "cerca-web"
}

variable "API_REPOSITORY" {
  default = "cerca-api"
}

group "default" {
  targets = ["web", "api"]
}

target "web" {
  context    = "."
  dockerfile = "apps/web/Dockerfile"
  tags       = ["${REGISTRY}/${WEB_REPOSITORY}:${TAG}"]
  platforms  = ["linux/amd64"]
}

target "api" {
  context    = "."
  dockerfile = "apps/api/Dockerfile"
  tags       = ["${REGISTRY}/${API_REPOSITORY}:${TAG}"]
  platforms  = ["linux/amd64"]
}
