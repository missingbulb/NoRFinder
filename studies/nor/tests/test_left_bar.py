"""3.2: the left bar holds Load Image, then Preprocessing, Algorithms, Post-processing and Summary, each
folding with the steps (1.38); the right bar the selected candidate and the ground truth."""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('contract', os.path.join(HERE, '..', '..', '..', 'web-tests', 'test_study_contract.py'))
contract = importlib.util.module_from_spec(spec); spec.loader.exec_module(contract)


def test_the_left_bar_holds_the_five_boxes_in_order():
    boxes = contract.Boxes(open(os.path.join(HERE, '..', 'web', 'nor.html'), encoding='utf8').read()).boxes
    assert [(slot, title, opens, folds) for slot, _, title, opens, folds in boxes] == [
        ('left', 'Preprocessing', 'load', 'find'),
        ('left', 'Algorithms', 'load', 'find'),
        ('left', 'Post-processing', 'user', None),
        ('left', 'Summary', 'find', None),
    ]
