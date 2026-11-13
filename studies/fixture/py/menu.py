"""The fixture's two algorithms, as the page lists them (study.json's algorithms): the first measured, the second not."""
import json

print(json.dumps({'measured': 'on 10 pixels counted by hand', 'algorithms': [
    {'key': 'above', 'title': 'above', 'icon': '◼', 'about': '- Count every pixel brighter than the threshold\n  - none equal to it',
     'precision': 0.9, 'recall': 0.8, 'note': 'a made-up score'},
    {'key': 'from', 'title': 'at or above', 'icon': '◻', 'about': '- Count every pixel at least as bright as the threshold'},
]}, ensure_ascii=False, indent=1))
