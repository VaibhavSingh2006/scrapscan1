"""
ScrapScan Image Scraper — Bing Image Crawler
Scrapes training images for all 6 scrap classes.
Run this locally or in Colab after installing icrawler.
"""
import os
from icrawler.builtin import BingImageCrawler

BASE_DIR = './data/raw'
IMAGES_PER_QUERY = 200

SEARCH_QUERIES = {
    'hms1': [
        'heavy melting steel scrap pile truck',
        'HMS1 structural steel scrap yard India',
        'thick steel beam scrap metal recycling',
        'iron girder scrap pile recycling yard'
    ],
    'hms2': [
        'light steel scrap sheet metal pile',
        'thin sheet metal stampings scrap yard',
        'HMS2 steel scrap recycling',
        'pressed steel scrap automobile parts'
    ],
    'galv': [
        'galvanized steel scrap pile recycling',
        'zinc coated steel scrap metal',
        'galvanized sheet metal spangle surface',
        'corrugated galvanized iron scrap yard'
    ],
    'ss': [
        'stainless steel scrap pile 304 grade',
        'shiny stainless steel metal recycling yard',
        'SS scrap bright metal 316 stainless'
    ],
    'nonfe': [
        'copper scrap metal pile reddish recycling',
        'aluminium scrap metal recycling bright',
        'mixed non ferrous scrap yard copper aluminium'
    ],
    'mixed': [
        'contaminated scrap metal plastic mixed',
        'mixed scrap pile rubber plastic metal junk',
        'scrap yard contamination waste mixed materials'
    ]
}


def scrape_all():
    for class_name, queries in SEARCH_QUERIES.items():
        for i, query in enumerate(queries):
            out_dir = os.path.join(BASE_DIR, class_name, f'query_{i}')
            os.makedirs(out_dir, exist_ok=True)
            print(f'\nScraping [{class_name}] query {i+1}/{len(queries)}: "{query}"')
            try:
                crawler = BingImageCrawler(
                    storage={'root_dir': out_dir},
                    feeder_threads=1,
                    parser_threads=1,
                    downloader_threads=4
                )
                crawler.crawl(keyword=query, max_num=IMAGES_PER_QUERY, min_size=(100, 100))
            except Exception as e:
                print(f'  ERROR: {e}')

    # Print summary
    print('\n=== SCRAPING COMPLETE ===')
    for cls in SEARCH_QUERIES.keys():
        count = sum(len(files) for _, _, files in os.walk(os.path.join(BASE_DIR, cls)))
        print(f'  {cls:8s}: {count} images')


if __name__ == '__main__':
    scrape_all()
