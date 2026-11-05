import json
import os
import subprocess

before = os.environ.get('BEFORE', '')
components = {'web', 'api'}
if before and set(before) != {'0'}:
    files = subprocess.check_output(['git', 'diff', '--name-only', before, 'HEAD'], text=True).splitlines()
    components = set()
    for path in files:
        if path.startswith('apps/web/'):
            components.add('web')
        elif path.startswith(('apps/api/', 'database/')):
            components.add('api')
        else:
            components.update(['web', 'api'])
release = {}
for component in sorted(components):
    repository = 'final-project-contact-list-' + component
    base = '817345470591.dkr.ecr.us-east-2.amazonaws.com/' + repository
    tag = os.environ['GITHUB_SHA']
    # A rerun reuses the existing immutable image.
    result = subprocess.run(['aws', 'ecr', 'describe-images', '--repository-name', repository, '--image-ids', 'imageTag=' + tag, '--output', 'json'], capture_output=True, text=True)
    if result.returncode:
        subprocess.run(['docker', 'buildx', 'build', '--platform', 'linux/amd64', '-f', 'apps/' + component + '/Dockerfile', '-t', base + ':' + tag, '--push', '.'], check=True)
        result = subprocess.run(['aws', 'ecr', 'describe-images', '--repository-name', repository, '--image-ids', 'imageTag=' + tag, '--output', 'json'], capture_output=True, text=True, check=True)
    release[component] = base + '@' + json.loads(result.stdout)['imageDetails'][0]['imageDigest']
with open('release.json', 'w') as output:
    json.dump(release, output)
