"""The comuni of the area the grand map covers, for the towns of the drawn sectors (extend_places.py): each comune's
seat with its position and population, from the GeoNames gazetteer of Italy (https://download.geonames.org/export/dump/
IT.zip, CC BY 4.0, www.geonames.org). Run with the unzipped IT.txt's path; writes comuni.json (seats in the map's area
only, by population)."""
import csv
import json
import os
import sys

HERE = os.path.dirname(__file__)
BOX = (40.0, 42.75, 12.5, 16.7)   # lat0, lat1, lon0, lon1: the grand map and a margin


def main(path):
    out = []
    with open(path, encoding='utf-8') as f:
        for row in csv.reader(f, delimiter='\t', quoting=csv.QUOTE_NONE):
            if len(row) < 15 or row[6] != 'P' or row[7] not in ('PPLA3', 'PPLA2', 'PPLA', 'PPLC'):
                continue
            lat, lon = float(row[4]), float(row[5])
            if not (BOX[0] <= lat <= BOX[1] and BOX[2] <= lon <= BOX[3]):
                continue
            out.append({'name': row[1], 'lat': round(lat, 5), 'lon': round(lon, 5), 'pop': int(row[14] or 0)})
    out.sort(key=lambda p: -p['pop'])
    json.dump({'_source': 'GeoNames (www.geonames.org), CC BY 4.0: seats of comuni (PPLA-PPLA3) with population', 'comuni': out},
              open(f'{HERE}/comuni.json', 'w'), indent=0, ensure_ascii=False)
    print(len(out), 'comuni;', sum(1 for p in out if p['pop']), 'with a population')


if __name__ == '__main__':
    main(sys.argv[1])
