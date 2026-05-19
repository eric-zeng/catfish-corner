from extract import extract
from render import render
from similarity import compute_similarity
from mogging import main as compute_mogging
from category_stats import compute_category_stats

extract()
render()
compute_similarity()
compute_mogging()
compute_category_stats()
