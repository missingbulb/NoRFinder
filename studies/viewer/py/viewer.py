"""The Image Viewer: no analysis, only the image, which the page reads and shows itself (req/shell/image/open); its
Python is never started, since it offers no action."""
import json


def ready():
    return json.dumps({})


class Session:
    def __init__(self, path):
        self.path = path

    def call(self, action, args):
        raise ValueError(f'unknown action {action!r}')
