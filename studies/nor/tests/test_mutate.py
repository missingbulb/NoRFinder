"""The NoR mutation adapter: a mutation spec parses into its slot and parameters, and a null mutant is the
same on every run, so the chance bar a sweep reports can be reproduced."""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import mutate as M
import nor_lab


def test_a_spec_names_its_slot_trick_parameters_and_quantile():
    assert M.parse('verify:unsharp-mask(r_u=1.5,amount=2)@red:reject=0.2') == ('verify', 'unsharp-mask', 'red', 'reject', {'r_u': 1.5, 'amount': 2}, 0.2)
    assert M.parse('pre:white-tophat@both') == ('pre', 'white-tophat', 'both', None, {}, None)


def test_a_null_mutant_is_reproducible():
    data = nor_lab.load(); _, info = nor_lab.run('tl', data)
    pos = lambda c: sorted((round(k['cx'], 2), round(k['cy'], 2), k['fail']) for k in c)
    for m in ('pre:null-3@both', 'verify:null-3@red:reject'):
        assert pos(M.run_mutant(m, 'tl', data, info['unit'])) == pos(M.run_mutant(m, 'tl', data, info['unit']))
