import json, sys, math
sys.path.insert(0,'.')
from hexsides import neighbors
T=json.load(open('../out/terrain.json'))
blue=json.load(open('../out/edges_blue.json'))
dark=json.load(open('../out/edges_dark.json'))
rauto=json.load(open('../out/roads_auto.json'))
LAND={'clear','hill','mountain','marsh'}
def key(a,b): return f"{a}-{b}" if a<b else f"{b}-{a}"
def adj(a,b): return b in neighbors(a)

hexes={}
for h,t in T.items():
    if t=='offmap': continue
    if t=='mountain': t='hill'          # map key has no mountain hex; dark shading = mountain hexsides
    hexes[h]={'terrain':t}

# ---------- hexsides ----------
sides={}
def side(a,b):
    assert adj(a,b), (a,b)
    return sides.setdefault(key(a,b),{})
# rivers
for k,v in blue.items():
    a,b=k.split('-')
    if T.get(a) in LAND and T.get(b) in LAND and v>=0.5: side(a,b)['river']=True
for k in ['3618-3718','3619-3718','3720-3820','3313-3314','3414-3415','3118-3218','3402-3403']:
    a,b=k.split('-'); side(a,b)['river']=True
for k in ['2201-2202','2202-2203']:
    sides.get(k,{}).pop('river',None)
# mountain hexsides + passes
PASSES=['3001-3101','2105-2205','2706-2807','2907-3007','3207-3208','2920-3020','4226-4325']
for k,v in dark.items():
    a,b=k.split('-')
    if v>=0.5: side(a,b)['mountain']=True
for k in PASSES:
    a,b=k.split('-'); s=side(a,b); s['mountain']=True; s['pass']=True
# major roads (hex paths)
MAJOR=[
 '2101 2201 2202 2302 2403 2503 2504 2605 2606 2607 2707 2708 2809 2810 2910 2911 3012 3013 3113 3213',
 '3012 2912 2913 2814 2815 2816 2716 2617 2618 2619 2620 2520 2621 2521 2522 2523 2624 2724 2825',
 '2707 2807 2806 2905 2904 3004 3103 3203',
 '3001 3002 3102 3203',
 '3203 3302 3402 3501 3601 3701 3802 3902 4003 4102 4202 4301 4401 4501 4601',
 '3700 3801 3802',
 '3203 3303 3403 3404 3504 3605 3606 3706 3807 3907 4007',
 '3907 3908 4009 4010 4110 4111 4212 4312 4313 4214 4314 4315 4316 4317 4418 4518 4619 4620',
 '4102 4203 4303 4304 4305 4406 4506 4507 4508 4409 4309 4310 4211 4111',
 '3213 3214 3314 3414 3514 3615 3614 3713 3712 3812 3911 4012 4111',
 '3314 3315 3416 3516 3617 3618 3718 3819 3820 3821 3822 3823 3824 3825 3826 3827',
 '3819 3919 4019 4020 4119 4220 4320 4421 4521 4622 4623',
]
for path in MAJOR:
    p=path.split()
    for a,b in zip(p,p[1:]): side(a,b)['road']='major'
for k in rauto['minor']:
    a,b=k.split('-'); s=side(a,b)
    if s.get('road')!='major': s['road']='minor'
for path in ['1803 1903 2004 2103 2203','2004 2005','1703 1803']:
    p=path.split()
    for a,b in zip(p,p[1:]):
        s=side(a,b)
        if s.get('road')!='major': s['road']='minor'
sides={k:v for k,v in sides.items() if v}

# ---------- features ----------
CITIES={'2202':'Torre Annunziata','2203':'Castellammare di Stabia','2700':'Palma Campania','2702':'Sarno',
 '2605':'Nocera Inferiore','2707':'Salerno','3203':'Avellino','3012':'Battipaglia','3213':'Eboli','4301':'Ariano Irpino'}
VP={'2202':1,'2702':1,'2605':1,'2707':2,'3203':2,'3012':1,'3213':1,'4301':1,'2407':1,'2811':1,'2716':1,'3116':1,'2418':1,'4111':1,'3819':1}
PORTS={'1803':{'capacity':1,'restricted':True},'2202':{'capacity':1,'restricted':True},'2306':{'capacity':1},'2407':{'capacity':1},
 '2607':{'capacity':1},'2707':{'capacity':3,'major':True,'damagedCapacity':1},'2418':{'capacity':1},'2424':{'capacity':1}}
TOWNS={'1803':'Sorrento','1903':'Vico Equense','2005':'Positano','2401':'Terzigno','2301':'Boscotrecase','2500':'San Giuseppe Vesuviano',
 '2501':'Poggiomarino','2302':'Scafati','2603':'San Valentino Torio','2503':'San Marzano sul Sarno','2404':'Angri','2204':'Gragnano',
 '2704':'Castel San Giorgio','2606':'Cava de’ Tirreni','2903':'Bracigliano','3002':'Monteforte Irpino','3101':'Mercogliano',
 '2905':'Sanseverino Rota','2806':'Baronissi','3205':'Solofra','3403':'Atripalda','3008':'San Cipriano Picentino','3210':'Montecorvino Rovella',
 '3310':'Acerno','3313':'Campagna','2306':'Amalfi','2407':'Maiori','2607':'Vietri sul Mare','3405':'Volturara Irpina',
 '2716':'Paestum','2818':'Capaccio','2619':'Ogliastro','2418':'Agropoli','2219':'Castellabate','3015':'Persano','3116':'Altavilla Silentina',
 '3017':'Albanella','3019':'Roccadaspide','3119':'Castel San Lorenzo','3021':'Felitto','3218':'Castelcivita','3220':'Aquara',
 '3314':'Ponte Sele','3315':'Serre','3417':'Postiglione','2721':'Orria','2823':'Gioi','2422':'Omignano','2223':'Acciaroli',
 '2424':'Marina di Casal Velino','2426':'Ascea','2527':'Pisciotta','2825':'Vallo della Lucania','3123':'Laurino','3224':'Piaggine','3027':'Rofrano',
 '3501':'Pratola Serra','3702':'Montemiletto','3503':'Chiusano di San Domenico','3902':'Mirabella Eclano','4102':'Grottaminarda',
 '4601':'Savignano di Puglia','4004':'Gesualdo','4104':'Frigento','3805':'Paternopoli','3605':'Montemarano','3807':'Nusco',
 '4007':'Sant’Angelo dei Lombardi','3908':'Lioni','4010':'Teora','3507':'Montella','3609':'Bagnoli Irpino','3811':'Calabritto',
 '4013':'Laviano','4212':'Sant’Andrea di Conza','4312':'Pescopagano','4511':'Calitri','4309':'Andretta','4406':'Vallata',
 '4304':'S. Sossio Baronia','4608':'Bisaccia','3713':'Oliveto Citra','3814':'Colliano','3615':'Contursi','3916':'San Gregorio Magno',
 '3817':'Buccino','3719':'Auletta','3920':'Caggiano','3821':'Polla','3722':'San Pietro al Tanagro','3825':'Sala Consilina',
 '3625':'Tegiano','3626':'Sassano','4020':'Vietri di Potenza','4118':'Balvano','4315':'Muro Lucano','4416':'Bella','4515':'San Fele',
 '4214':'Castelgrande','4419':'Baragiano','4619':'Ruoti','4421':'Picerno','4322':'Tito','4024':'Brienza','4124':'Sasso di Castalda',
 '4126':'Marsico Nuovo','4524':'Pignola di Lucania','4527':'Calvello','3700':'San Giorgio del Sannio'}
for h,n in CITIES.items(): hexes[h]['city']=n
for h,n in TOWNS.items():
    if h in hexes and 'city' not in hexes[h]: hexes[h]['town']=n
for h,v in VP.items(): hexes[h]['vp']=v
for h,p in PORTS.items(): hexes[h]['port']=p
hexes['2811']['airfield']='Montecorvino'
hexes['3303']['dropZone']='Avellino (2/509th)'

entry={
 'N1':{'hexes':['2100','2300','2500','2700','2900','3001','3100'],'side':'north','label':'N1 to Naples','vp':5},
 'N2':{'hexes':['3300','3500','3700','3900'],'side':'north','label':'N2 to Benevento','vp':4},
 'E5':{'hexes':['4601','4602','4603'],'side':'east'},
 'E4':{'hexes':['4608','4609','4610'],'side':'east'},
 'E3':{'hexes':['4614','4615','4616'],'side':'east'},
 'E2':{'hexes':['4620','4621','4622','4623'],'side':'east','label':'E2 Potenza'},
 'E1':{'hexes':['4626','4627'],'side':'east'},
 'S1':{'hexes':['2927','3027','3127'],'side':'south','label':'S1 (5th British Div.)'},
 'S2':{'hexes':['3627','3827'],'side':'south','label':'S2 (5th British Div., 11th CN Tank Regt.)'},
 'S3':{'hexes':['4027','4127'],'side':'south','label':'S3 (1st CN Div., 14th CN Tank Regt.)'},
}
offmapLinks=[{'from':'N1','to':'N2','turns':1,'side':'GE','note':'1 Turn, German only'},
 {'from':'E5','to':'E4','turns':1},{'from':'E4','to':'E3','turns':1},{'from':'E3','to':'E2','turns':1},
 {'from':'E2','to':'E1','turns':1},{'from':'E1','to':'S3','turns':1},{'from':'S3','to':'S2','turns':1},{'from':'S2','to':'S1','turns':1}]
beaches={
 'Uncle':{'hex':'2710','formation':'46th Div','unit':'128 Bde','corps':'X'},
 'Sugar':{'hex':'2711','formation':'56th Div','unit':'169 Bde','corps':'X'},
 'Roger':{'hex':'2712','formation':'56th Div','unit':'167 Bde','corps':'X'},
 'Red':{'hex':'2616','formation':'36th Div','unit':'142 Rgt','corps':'VI'},
 'Blue':{'hex':'2617','formation':'36th Div','unit':'141 Rgt','corps':'VI'},
 'Maiori':{'hex':'2407','formation':"Darby's Rangers",'corps':'X'},
 'Vietri':{'hex':'2607','formation':'Commando Brigade','corps':'X'},
}
# 8th Army sector: south-east of a dashed line; polyline in grid coordinates
def gxy(h):
    c,r=int(h[:2]),int(h[2:]); return c*0.866, r+(0.5 if c%2 else 0)
line=[gxy(h) for h in ['2425','3420','3818','4017']]
def in8(h):
    x,y=gxy(h)
    if x>40.5*0.866: return True
    # below polyline?
    for (x0,y0),(x1,y1) in zip(line,line[1:]):
        if x0<=x<=x1:
            yy=y0+(y1-y0)*(x-x0)/(x1-x0); return y>yy
    return False
for h in hexes:
    if hexes[h]['terrain']!='sea' and in8(h): hexes[h]['sector8']=True

out={'meta':{'title':'Salerno ’43 map data','source':'Transcribed from photos of the owner’s physical map; verify against your copy.',
 'grid':'flat-top hexes in vertical columns; odd columns are offset half a hex down; id = CCRR'},
 'hexes':hexes,'hexsides':sides,'entryAreas':entry,'offmapLinks':offmapLinks,'beaches':beaches,
 'navalLine':{'note':'No naval support, port supply or naval transport north of this line','maxRowExclusive':3,'restrictedPorts':['1803','2202']}}
json.dump(out,open(sys.argv[1],'w'),indent=1,sort_keys=True)
from collections import Counter
print(len(hexes),'hexes',len(sides),'sides',Counter(k for s in sides.values() for k in s))
