"""The lab's fetch (studies/shelves/lab/photos.py): a ground truth the shell saved in the study's GT folder lands under
the photo its hash names, by the photo's Drive id and the tagger."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lab'))
import photos

PHOTOS = [dict(name='a.jpg', drive_id='1aaa', sha256='00fa0d36' + '0' * 56), dict(name='a.jpg', drive_id='1bbb', sha256='3b19afd1' + '0' * 56)]


def test_a_ground_truth_lands_under_the_photo_its_hash_names():
    got = photos.gt_name('GT/PHOTO-2026-09-25-22-58-56__3b19afd1/gt_someone@example.com.json', PHOTOS)
    assert got == os.path.join(photos.RAW, 'gt', '1bbb__someone@example.com.json')


def test_photos_data_and_unknown_hashes_are_no_ground_truth():
    assert photos.gt_name('Data/a.jpg', PHOTOS) is None
    assert photos.gt_name('rauntruth-study.json', PHOTOS) is None
    assert photos.gt_name('GT/b__ffffffff/gt_x.json', PHOTOS) is None
