variable "REGISTRY" {
  default = "local"
}

variable "TAG" {
  default = "dev"
}

group "default" {
  targets = ["web", "api"]
}

target "web" {
  context    = "."
  dockerfile = "apps/web/Dockerfile"
  tags       = ["${REGISTRY}/cerca-web:${TAG}"]
  platforms  = ["linux/amd64"]
}

target "api" {
  context    = "."
  dockerfile = "apps/api/Dockerfile"
  tags       = ["${REGISTRY}/cerca-api:${TAG}"]
  platforms  = ["linux/amd64"]
}
