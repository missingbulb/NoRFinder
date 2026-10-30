"""1.30: the form Submit New Study Request opens asks for everything a new study needs."""
import os

import yaml

FORM = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.github', 'ISSUE_TEMPLATE', 'new-study.yml')


def fields():
    form = yaml.safe_load(open(FORM))
    return form, {f['id']: f for f in form['body'] if 'id' in f}


def test_the_form_asks_for_a_proposal_samples_ground_truth_literature_and_who_sent_it():
    form, by_id = fields()
    assert form['labels'] == ['new-study-request']
    required = {k for k, f in by_id.items() if f.get('validations', {}).get('required')}
    assert required == {'proposal', 'samples', 'literature', 'name', 'email'}, required
    assert 'ground-truth' in by_id and 'ground-truth' not in required


def test_the_proposal_takes_an_attachment():
    """Only a textarea takes a file dropped into it; an input takes a link alone."""
    _, by_id = fields()
    assert by_id['proposal']['type'] == 'textarea'
