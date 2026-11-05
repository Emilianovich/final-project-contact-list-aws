"""Deploy immutable image digests; configuration comes from terraform output -json deployment."""
import json
import os
import subprocess
import sys
import urllib.request
import time


def aws(*args):
    return json.loads(subprocess.check_output(["aws", *args, "--output", "json"]))


config = json.loads(subprocess.check_output(["terraform", "-chdir=terraform", "output", "-json", "deployment"]))
release = json.load(open(sys.argv[1]))
cluster = config["cluster"]
old = {}
new = {}
for component, image in release.items():
    if component not in ("web", "api"):
        raise ValueError("Unexpected component")
    if not image.startswith(config["repositories"][component] + "@sha256:"):
        raise ValueError("Image must be a digest from the expected ECR repository")
    service = aws("ecs", "describe-services", "--cluster", cluster, "--services", config["services"][component])["services"][0]
    old[component] = service["taskDefinition"]
    definition = aws("ecs", "describe-task-definition", "--task-definition", config["definitions"][component])["taskDefinition"]
    for key in ["taskDefinitionArn", "revision", "status", "requiresAttributes", "compatibilities", "registeredAt", "registeredBy", "deregisteredAt"]:
        definition.pop(key, None)
    for container in definition["containerDefinitions"]:
        if container["name"] == component:
            container["image"] = image
    new[component] = aws("ecs", "register-task-definition", "--cli-input-json", json.dumps(definition))["taskDefinition"]["taskDefinitionArn"]

if "api" in new:
    network = {"awsvpcConfiguration": {"subnets": [config["subnet"]], "securityGroups": [config["backend_sg"]], "assignPublicIp": "DISABLED"}}
    result = aws("ecs", "run-task", "--cluster", cluster, "--launch-type", "FARGATE", "--task-definition", new["api"], "--network-configuration", json.dumps(network), "--overrides", json.dumps({"containerOverrides": [{"name": "api", "command": ["node", "apps/api/dist/database/migrate.js"]}]}))
    if result.get("failures") or not result.get("tasks"):
        raise RuntimeError(str(result))
    task = result["tasks"][0]["taskArn"]
    subprocess.run(["aws", "ecs", "wait", "tasks-stopped", "--cluster", cluster, "--tasks", task], check=True)
    stopped = aws("ecs", "describe-tasks", "--cluster", cluster, "--tasks", task)["tasks"][0]
    if not stopped.get("containers") or any(c.get("exitCode") != 0 for c in stopped["containers"]):
        raise RuntimeError("Migration failed: " + json.dumps(stopped))

for component in ["api", "web"]:
    if component not in new:
        continue
    service_name = config["services"][component]
    aws("ecs", "update-service", "--cluster", cluster, "--service", service_name, "--task-definition", new[component], "--desired-count", "1")
    subprocess.run(["aws", "ecs", "wait", "services-stable", "--cluster", cluster, "--services", service_name], check=True)
    active = aws("ecs", "describe-services", "--cluster", cluster, "--services", service_name)["services"][0]
    if active["taskDefinition"] != new[component]:
        raise RuntimeError("ECS rolled back deployment: " + component)

for attempt in range(12):
    try:
        with urllib.request.urlopen(config["public_url"] + "/api/health", timeout=10) as response:
            if json.load(response).get("status") != "ok":
                raise RuntimeError("Unexpected health response")
        break
    except Exception:
        if attempt == 11:
            raise
        time.sleep(5)
print("Deployment healthy:", config["public_url"])
