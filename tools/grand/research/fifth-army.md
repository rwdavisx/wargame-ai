# Fifth Army, 9 Sept - 31 Dec 1943: one order of battle for the grand campaign

Machine-readable companion: `fifth-army.json`. Its `continuity`, `onlySalerno` and `onlyItaly` lists cover the counters;
`arrivals`, `withdrawals` and `positions1Oct` hold the history, each with lat/lon and a source; `turnMapping` is the turn track.
`germanContinuity` is a short German list. Items marked "uncertain" are flagged in both files.

## Sources (short names used below)

- **Blumenson**: M. Blumenson, *Salerno to Cassino* (US Army in WWII, CMH 1969). Full text at archive.org `SalernoToCassino`;
  page numbers come from the running page numbers in the djvu text. p.254 was also checked on the page image.
- **AFIA**: *Salerno: American Operations from the Beaches to the Volturno, 9 Sept - 6 Oct 1943* (American Forces in Action,
  CMH Pub 100-7), archive.org `Salerno_139`.
- **Starr**: C. G. Starr (ed.), *From Salerno to the Alps: a History of the Fifth Army 1943-1945* (1948), the published
  one-volume Fifth Army history, archive.org `FromSalernoToTheAlps`. The multi-part "Fifth Army History" was not found on archive.org.
- **Molony V**: C. J. C. Molony, *The Mediterranean and Middle East* vol. V (HMSO 1973), archive.org
  `mediterranean-middle-east-vol-5`. Page numbers are read from the running heads, so they may be off by one.
- **Wikipedia**: articles cited by URL. Every latitude/longitude comes from the place's own en.wikipedia article (its coord
  template, or the decimal "geo" figure on the page). For a beach or a drop zone, the nearest town stands in and the entry is marked approximate.

## 1. The two orders of battle side by side

### How the counters relate

Every Fifth Army formation in Salerno '43 that is still in the theatre on 1 October appears in Italy '43, almost always with
**identical values**. Where Salerno breaks a formation into a "(-)" counter plus a detached battalion, the two Salerno counters
add up exactly to the Italy counter:

- 128 Bde(-) 3-5-3 + 5 Hampshires 2-2-3 = 128/46 5-7-3. The same holds for 167 Bde + 7 Ox & Bucks and for 169 Bde + 2/6 Queen's.
- 141 RCT(-) 4-4-3 + 2/141 2-2-3 = 141/36 6-6-3. The same holds for 142 + 1/142 and for 157 + 2/157.
- 504 PIR(-) 3-4-3 + 3/504 2-2-3 = 504/82 5-6-3.
- 22 Armd Bde(-) 8-6-5 + 5 RTR 3-2-5 = 22/7A 11-8-5, and Italy's reduced side of 22/7A is the Salerno 22 Armd Bde(-) 8-6-5.

So one counter per unit is possible. In September the Salerno breakdown counters stay in use. A "recombine" rule (both parts
in one hex at the start of a turn, both at full strength) can fold them into the Italy counter, or the fold can happen
automatically at the first October turn.

Only two real value conflicts exist on the Allied side: the **756th Tank Bn** (Salerno 3-2-5, Italy 2-2-5) and the **22 Armd Bde
remnant** (Salerno 3-2-5, Italy 5-3-5). Several tank and TD battalions change their formation label: they are "VI Corps" in
Salerno but attached to divisions in Italy (751 and 601 to the 3rd Div, 753 and 636 to the 36th, 645 to the 45th). The Royal
Scots Greys go from X Corps to 23 Armd Bde, and the KDG from X Corps to Independent. Those labels matter only for divisional
integrity and ASU rules; take the Italy labels from 1 October.

### Continuity table (Allied)

| Salerno id(s) | Salerno values | Italy id | Italy values | Unit | Note |
|---|---|---|---|---|---|
| US-1Rgr | 2-2-3 | US-1Rgr | 2-2-3 | 1st Ranger Bn | Same values. Salerno: lands Maiori D-Day; Italy: arrives Naples T14 (Nov 4-6), removed T20. Historically with the 82nd into Naples 2 Oct, recommitted at Venafro 8-10 Nov (Blumenson pp.165, 231; Starr p.52). |
| US-3Rgr | 2-2-3 | US-3Rgr | 2-2-3 | 3rd Ranger Bn | Same values. Italy arrives Naples T20 (Nov 22-24), removed T27; historically at San Pietro 29 Nov and Hill 950 7-13 Dec (Blumenson p.273; Starr pp.66-67). |
| US-4Rgr | 2-2-3 | US-4Rgr | 2-2-3 | 4th Ranger Bn | Same values. Italy arrives Naples T12 (Oct 29-31), removed T22; historically crossed the Volturno 3 Nov to Cannavinelle Hill (Blumenson p.222; Starr p.51). |
| BR-128+BR-5H | 3-5-3/1-3-3 + 2-2-3 | BR-128-46 | 5-7-3/3-5-3 | 128th Brigade, 46th Div | Salerno splits the brigade: 128 Bde(-) 3-5-3 + 5th Hampshires 2-2-3 = Italy 5-7-3 (back 3-5-3). Combine when both are on the map (or keep the split until the Italy phase). |
| BR-138 | 5-7-3/3-5-3 | BR-138-46 | 5-7-3/3-5-3 | 138th Brigade, 46th Div | Identical counter. Landed 9 Sept from 7 a.m. (Molony V p.278-280). |
| BR-139 | 5-7-3/3-5-3 | BR-139-46 | 5-7-3/3-5-3 | 139th Brigade, 46th Div | Identical counter. Landed night 9/10 Sept (Molony V p.280); Salerno T2. |
| BR-46Art | 0-1-5 | BR-46DivASU | 0-1-5 | 46th Div ASU | Same 0-1-5. |
| BR-167+BR-7OB | 3-5-3/1-3-3 + 2-2-3 | BR-167-56 | 5-7-3/3-5-3 | 167th Brigade, 56th Div | 167 Bde(-) 3-5-3 + 7th Ox & Bucks 2-2-3 = Italy 5-7-3. |
| BR-169+BR-2-5Q | 3-5-3/1-3-3 + 2-2-3 | BR-169-56 | 5-7-3/3-5-3 | 169th (Queen's) Brigade, 56th Div | 169 Bde(-) 3-5-3 + 2/6th Queen's 2-2-3 = Italy 5-7-3. Note the Salerno id BR-2-5Q is named 2/6 Queen's. |
| BR-201G | 5-7-3/3-5-3 | BR-201G-56 | 5-7-3/3-5-3 | 201st Guards Brigade, 56th Div | Identical counter. Landed 9 Sept 7.15 a.m. in reserve (Molony V p.278). Wikipedia 56th Div lists it "left 17 September 1943" (Joslen) yet it fought on Camino with 56 Div in Nov (Starr p.52); treat as 56 Div throughout. **(uncertain)** |
| BR-56Art | 0-1-5 | BR-56DivASU | 0-1-5 | 56th Div ASU | Same 0-1-5. |
| BR-40RTR | 3-2-5 | BR-40RTR | 3-2-5 | 40th RTR, 23rd Armd Bde | Same 3-2-5. The only 23 Armd Bde tank unit in the assault (https://en.wikipedia.org/wiki/23rd_Armoured_Brigade_(United_Kingdom)). |
| BR-Greys | 3-2-5 | BR-RSG | 3-2-5 | Royal Scots Greys | Same 3-2-5. Salerno formation "X Corps" (affiliated to 56 Div, earmarked for 23 Armd Bde: Molony V p.276); Italy formation "23 Arm Bde". Use 23 Armd Bde. |
| BR-KDG | 2-2-6 | BR-1KDG | 2-2-6 | 1st King's Dragoon Guards | Same 2-2-6 recon. Salerno: X Corps, arrives T16 (24 Sept); Italy: Independent, at start 2224 (Naples). A Sqn reached central Naples 09:30 1 Oct (Molony V p.343; AFIA Salerno p.87). |
| BR-XArt | 0-1-5 | BR-10CorpsASU | 0-1-5 | X Corps ASU | Same 0-1-5 (Italy range 5). |
| BR-131 | 5-7-5/3-5-5 | BR-131-7A | 5-7-5/3-5-5 | 131st (Queen's) Lorried Infantry Brigade, 7th Armd Div | Identical 5-7-5. Expected ashore 15 Sept (Molony V p.301). |
| BR-22+BR-5RTR | 8-6-5/5-4-5 + 3-2-5 | BR-22-7A | 11-8-5/8-6-5 | 22nd Armoured Brigade, 7th Armd Div | 22 Armd Bde(-) 8-6-5 + 5 RTR 3-2-5 = Italy 11-8-5 (whose back is 8-6-5). Remnant differs: Salerno BR-REM-22 3-2-5 vs Italy BR-REM-22-7A 5-3-5. |
| BR-11H | 2-2-6 | BR-11H-7A | 2-2-6 | 11th Hussars, 7th Armd Div | Same 2-2-6. Italy removes it T13 (Nov 1-3), ahead of the rest of the division. |
| BR-7AArt | 0-1-5 | BR-7ADivASU | 0-1-5 | 7th Armd Div ASU | Same 0-1-5. |
| US-141+US-2-141 | 4-4-3/1-3-3 + 2-2-3 | US-141-36 | 6-6-3/4-4-3 | 141st Infantry, 36th Div | 141 RCT(-) 4-4-3 + 2/141 2-2-3 = Italy 6-6-3. Italy: returns T18 (Nov 16-18). |
| US-142+US-1-142 | 4-4-3/1-3-3 + 2-2-3 | US-142-36 | 6-6-3/4-4-3 | 142nd Infantry, 36th Div | 142 RCT(-) 4-4-3 + 1/142 2-2-3 = Italy 6-6-3 (Italy back estimated). Italy: returns T17. |
| US-143 | 6-6-3/4-4-3 | US-143-36 | 6-6-3/4-4-3 | 143rd Infantry, 36th Div | Identical 6-6-3. Italy: returns T17. |
| US-36Art | 0-1-5 | US-36DivASU | 0-1-5 | 36th Div ASU | Same. Italy: returns T18. |
| US-179 | 6-6-3/4-4-3 | US-179-45 | 6-6-3/4-4-3 | 179th Infantry, 45th Div | Identical 6-6-3. Landed 10 Sept (Blumenson p.99). Italy: enters T2 reduced from S2 (in the grand game it is already on the map). |
| US-157+US-2-157 | 4-4-3/1-3-3 + 2-2-3 | US-157-45 | 6-6-3/4-4-3 | 157th Infantry, 45th Div | 157 RCT(-) 4-4-3 + 2/157 2-2-3 = Italy 6-6-3. Two battalions landed 10 Sept, the third on 15 Sept (Blumenson p.100). Blumenson names the late one the 1st Bn, but 1/157 fought at the Tobacco Factory 11-13 Sept (AFIA Salerno pp.46, 57, 62) - the game's 2/157 is consistent with that. **(uncertain)** |
| US-180 | 6-6-3/4-4-3 | US-180-45 | 6-6-3/4-4-3 | 180th Infantry, 45th Div | Identical 6-6-3. Landed early 14 Sept (AFIA Salerno p.72). |
| US-45Art | 0-1-5 | US-45DivASU | 0-1-5 | 45th Div ASU | Same. |
| US-30 | 6-7-3/4-5-3 | US-30-3 | 6-7-3/4-5-3 | 30th Infantry, 3rd Div | Identical 6-7-3. |
| US-7 | 6-7-3/4-5-3 | US-7-3 | 6-7-3/4-5-3 | 7th Infantry, 3rd Div | Identical 6-7-3. |
| US-15 | 6-7-3/4-5-3 | US-15-3 | 6-7-3/4-5-3 | 15th Infantry, 3rd Div | Identical 6-7-3. |
| US-3Art | 0-1-5 | US-3DivASU | 0-1-5 | 3rd Div ASU | Same. |
| US-133 | 4-4-3/1-3-3 | US-133-34 | 4-4-3/1-3-3 | 133rd Infantry (-), 34th Div | Identical 4-4-3 (the 2nd Bn stayed in Algiers; the 100th Bn replaced it: Blumenson p.162). |
| US-100 | 2-2-3 | US-100-34 | 2-2-3 | 100th Infantry Bn (Nisei) | Identical 2-2-3 (Italy elite). |
| US-135 | 6-6-3/4-4-3 | US-135-34 | 6-6-3/4-4-3 | 135th Infantry, 34th Div | Identical 6-6-3. Italy T4 arrival S2 is the same counter continuing. |
| US-168 | 6-6-3/4-4-3 | US-168-34 | 6-6-3/4-4-3 | 168th Infantry, 34th Div | Identical 6-6-3. |
| US-34Art | 0-1-5 | US-34DivASU | 0-1-5 | 34th Div ASU | Same. |
| US-504+US-3-504 | 3-4-3/1-3-3 + 2-2-3 | US-504-82 | 5-6-3/3-4-3 | 504th Parachute Infantry, 82nd Abn | 504 PIR(-) 3-4-3 + 3/504 2-2-3 = Italy 5-6-3. Stays in Italy when the 82nd leaves (Blumenson p.186). Italy: Naples garrison, released T11. |
| US-505 | 5-6-3/3-4-3 | US-505-82 | 5-6-3/3-4-3 | 505th Parachute Infantry, 82nd Abn | Identical 5-6-3. Italy: Naples garrison, removed T19 (Nov 19-21). |
| US-325 | 5-6-3/3-4-3 | US-325G-82 | 5-6-3/3-4-3 | 325th Glider Infantry, 82nd Abn | Identical 5-6-3. Italy: Naples garrison, removed T19. Co. G held Ischia (Blumenson p.164). |
| US-2-509 | 2-2-3 | US-2-509 | 2-2-3 | 2nd Bn, 509th Parachute Infantry | Same 2-2-3. Salerno formation 82 Abn (attached), Italy Independent. Italy: arrives Naples T15, removed T28. |
| US-191 | 3-2-5 | US-191 | 3-2-5 | 191st Tank Bn | Same 3-2-5; VI Corps vs Independent. |
| US-645 | 2-2-5 | US-645 | 2-2-5 | 645th TD Bn | Same 2-2-5; VI Corps vs 45 Div. |
| US-601 | 2-2-5 | US-601 | 2-2-5 | 601st TD Bn | Same 2-2-5; VI Corps vs 3 Div. |
| US-751 | 3-2-5 | US-751 | 3-2-5 | 751st Tank Bn | Same 3-2-5; VI Corps vs 3 Div. (Blumenson index lists it as "751st Tank Destroyer Battalion" p.197 - a slip.) |
| US-753 | 3-2-5 | US-753 | 3-2-5 | 753rd Tank Bn | Same 3-2-5; VI Corps vs 36 Div. |
| US-636 | 2-2-5 | US-636 | 2-2-5 | 636th TD Bn | Same 2-2-5; VI Corps vs 36 Div. |
| US-756 | 3-2-5 | US-756 | 2-2-5 | 756th Tank Bn | VALUES DIFFER: Salerno 3-2-5, Italy 2-2-5 (tank rating 2). Pick one. **(uncertain)** |
| US-VIArt | 0-1-5 | US-VICorpsASU | 0-1-5 | VI Corps ASU | Same 0-1-5 (Italy range 5). |
| US-REM-A | 1-3-3 | US-REM-A | 1-3-3 | Remnant US-REM-A | Same 1-3-3 remnant; one shared pool. |
| US-REM-B | 1-3-3 | US-REM-B | 1-3-3 | Remnant US-REM-B | Same 1-3-3 remnant; one shared pool. |
| US-REM-C | 1-3-3 | US-REM-C | 1-3-3 | Remnant US-REM-C | Same 1-3-3 remnant; one shared pool. |
| US-REM-82 | 1-3-3 | US-REM-82 | 1-3-3 | Remnant US-REM-82 | Same 1-3-3 remnant; one shared pool. |
| BR-REM-A | 1-3-3 | BR-REM-A | 1-3-3 | Remnant BR-REM-A | Same 1-3-3 remnant; one shared pool. |
| BR-REM-B | 1-3-3 | BR-REM-B | 1-3-3 | Remnant BR-REM-B | Same 1-3-3 remnant; one shared pool. |
| BR-REM-C | 1-3-3 | BR-REM-C | 1-3-3 | Remnant BR-REM-C | Same 1-3-3 remnant; one shared pool. |
| BR-REM-22 | 3-2-5 | BR-REM-22-7A | 5-3-5 | 22 Armd Bde remnant | VALUES DIFFER: Salerno 3-2-5, Italy 5-3-5. **(uncertain)** |

### Allied units in Salerno '43 only

| Salerno id | Unit | What happens to it |
|---|---|---|
| BR-2Cdo, BR-41Cdo | No. 2 and No. 41 (RM) Commandos | Relieved 18 Sept and withdrawn to Sicily (Wikipedia, No. 2 Commando: <https://en.wikipedia.org/wiki/No._2_Commando>). Remove in GT5. |
| BR-5H, BR-7OB, BR-2-5Q, BR-5RTR, US-1-142, US-2-141, US-2-157, US-3-504 | detached battalions | Fold into their parent counter (table above). |
| US-3-531, US-BH531R, US-BH531B, BR-BH21, BR-BH35 | shore engineers and beach groups | Remove when the beaches close. American unloading moved from the Salerno beaches to Naples on 14 Oct (Starr p.35), in GT18; X Corps still used Salerno then. |
| BR-13, BR-15, BR-17 (5th Div); CN-1, CN-2, CN-3, CN-11, CN-14 (1st Cdn Div, 1st Cdn Armd Bde) | Eighth Army | Not Fifth Army. They enter the south edge on Salerno T11-12 (19-20 Sept, GT6) and belong to the Adriatic/Eighth Army OOB. |

### Allied units in Italy '43 only

| Italy id | Unit | Game schedule | History |
|---|---|---|---|
| BR-168-56 | 168 (London) Bde | T5 (9-10 Oct), Naples | Rejoined 56 Div 17 Oct 1943 (Joslen, quoted on Wikipedia, 56th Div) **(uncertain)** |
| BR-11K-23A | 11 KRRC, 23 Armd Bde | T17, S1/S2 | in 23 Armd Bde (Starr p.477); arrival date not checked **(uncertain)** |
| BR-9Cmdo | No. 9 Commando | T31, Naples | Op. Partridge raid north of the Garigliano mouth, night 29/30 Dec (Starr p.71) |
| US-6-1A, US-1ADivASU | 1st Armored Div | T13, Naples | Began landing at Naples 28 Oct (Wikipedia) or mid-Nov (Starr p.53); under Fifth Army 15 Nov (Blumenson p.251); 6th Armd Inf in the line about 31 Dec (Starr p.71) |
| US-776, US-760, US-755, US-91 | 34 Div TD bn; 34 and 45 Div tank bns; 91 Cav Recon Sqn | T4; T12; T13; T9 | dates not checked **(uncertain)** |
| US-IICorpsASU | II Corps | T17, Naples | Took over the Mignano sector 18 Nov (Blumenson p.251) |
| US-M1 | 8-inch howitzers | T18, Naples | First used in combat, late Nov (Blumenson p.256) |
| US-1SSF | 1st Special Service Force | T19, Naples | At Naples 17 Nov (Wikipedia); under II Corps 23 Nov (Blumenson p.255); Monte la Difensa 2-3 Dec (Starr p.64) |
| FR-4-2M, FR-5-2M, FR-8-2M, FR-4MG-2M, FR-2MDivASU | 2e DIM | T23, Naples | Began unloading at Naples 20 Nov (Blumenson p.254); in the line 8-13 Dec (Starr p.71) |
| IT-1Mtr | 1st Italian Motorized Group | T24, S1 | Under Fifth Army 31 Oct (Starr p.53); near Capua 22 Nov (Blumenson p.253); Monte Lungo 8 and 16 Dec |
| BR-REM-A-M..C-M, US-REM-6-1A, FR-REM-A/B | remnants | from start | |

Not in either game but in the period: the 3e DIA (end of December, Starr p.53) and the British 1st Division (arriving end of
December, Molony V p.475).

## 2. History of the Fifth Army, September to December

### Landings and September build-up (Salerno '43)

D-Day was **9 Sept**. On the X Corps side, 46th Div's 128 Bde and 40 RTR landed on the Uncle beaches. 138 Bde followed from
07:00 and 139 Bde during the night of 9/10 (Molony V pp.278-280). 56th Div landed with 167 and 169 Bdes and the Royal Scots
Greys either side of the Tusciano, with 201 Gds Bde from 07:15 (Molony V pp.276-278). The Commandos landed at Vietri sul Mare
(40.667, 14.733) and Darby's three Ranger battalions at Maiori (40.65, 14.65). For VI Corps, the 36th Div landed at Paestum
(40.422, 15.005): the 141st and 142nd assaulted and the 143rd, in reserve, landed between 06:40 and 08:00 (Molony V p.280).

The September reinforcements, with the Salerno turn (day = turn + 8) and the grand turn:

| Date | Unit | Where | Salerno T | GT | Source |
|---|---|---|---|---|---|
| 10 Sept | 179th Inf; 157th Inf (2 bns) | Paestum | 2 | 1 | Blumenson pp.99-100 |
| 13/14 Sept night | 504th PIR (1st, 2nd Bns), dropped in the beachhead | Paestum DZ | 5 | 3 | AFIA p.67; Blumenson p.124 |
| 14 Sept (early) | 180th Inf, to Monte Soprano reserve | Paestum | 6 | 3 | AFIA p.72 |
| 14/15 Sept night | 505th PIR, dropped south of Paestum | Paestum | 6 | 3 | Starr p.29 |
| 14/15 Sept night | 2/509th PIR, dropped near Avellino (40.917, 14.789) | Avellino | 6 | 3 | AFIA p.72; Blumenson p.131 |
| 14-23 Sept | 7th Armd Div lands; 131 Bde first; complete 23 Sept | X Corps beaches, Salerno (40.681, 14.759) | 7-11 | 3-8 | AFIA p.72 and Starr p.29 give 14 Sept; Molony V p.333 and Wikipedia give 15 Sept **(uncertain by a day)** |
| 15 Sept | 325th GIR + 3/504th, by LCI from Licata | Paestum | 8 | 4 | AFIA p.72; Starr p.29. Blumenson p.122 has them sailing on 15 Sept, so 15 or 16 Sept **(uncertain)** |
| 15 Sept | third battalion of the 157th | Paestum | 7 | 4 | Blumenson p.100 (see note) |
| 18 Sept | 3rd Div begins landing (30th, then 7th and 15th); 82nd Abn HQ air-landed | Paestum | 10-13 | 5-7 | AFIA p.81; Blumenson p.137 |
| 18 Sept | Co. G 325th GIR to Ischia (40.731, 13.896) | Ischia | - | 5 | Blumenson pp.137, 164 |
| 21 Sept | 34th Div begins landing (133rd, 100th Bn) | Paestum | 14 | 7 | AFIA p.87; Starr p.35 |
| 25 Sept | rest of 34th Div (135th, 168th) | Paestum | 18-19 | 9-10 | Wikipedia, 34th Inf Div **(uncertain)** |
| ~24 Sept | 1st King's Dragoon Guards | Salerno | 16 | 8 | Wikipedia gives only "September" **(uncertain)** |

Note on the 157th: Blumenson (p.100) says the 1st Bn arrived late, on 15 Sept. AFIA (pp.46, 57, 62) has 1/157 fighting at
the Tobacco Factory on 11-13 Sept. The game's late 2/157 agrees with AFIA.

The salient fact for the turn track: the Salerno '43 schedule matches the historical days closely. The 3/504 and 325th are
a day late, and the 34th's last two regiments arrive on the 26th-27th rather than the 25th.

### Commands and the drive to Naples

Lucas took over VI Corps on 20 Sept. The **36th Div went into Army reserve** to guard the Salerno beaches, and the 3rd Div
took its place (Starr p.33). The 3rd Div went through Acerno (40.733, 15.050) and the 45th up Highway 91 to Teora (40.852,
15.254) by 26 Sept (AFIA p.84). On 26 Sept the 82nd Abn (Ridgway) moved by LCI to Maiori and took command of the Ranger
Force under X Corps (Starr p.35; Blumenson p.164). By then the Ranger Force included 23 Armd Bde, the 325th, a battalion of
the 504th and one of the 143rd (Blumenson p.163). 10 Corps attacked on 23 Sept. The 46th took the Camerelle gap on 28 Sept,
and 131 Bde seized the Sarno bridge at Scafati (40.754, 14.525) on 28/29 Sept (Molony V p.343; Blumenson p.165). The 3rd
Div took **Avellino** on the night of 29/30 Sept (AFIA p.87).

### Where everyone was on 30 Sept / 1 Oct, against Italy '43's set-up

| Unit | Historical place, 30 Sept-1 Oct | lat, lon | Italy '43 1 Oct set-up | Source |
|---|---|---|---|---|
| 82nd Abn (504, 505, 325) | entering **Naples**: 1 Oct (Blumenson) or 2 Oct (AFIA). Two bns of the 505th reached Torre Annunziata with 23 Armd Bde on 30 Sept | 40.836, 14.249 | Naples garrison, hexes 2125/2024/2124 | Blumenson p.165; AFIA p.88; Molony V p.343 |
| 23 Armd Bde (40 RTR, Greys), KDG | Naples; KDG A Sqn in the city centre at 09:30 on 1 Oct, then round the city to the east and north towards the Volturno | 40.836, 14.249 | hex 2224 (Casoria) | Molony V p.343; AFIA p.87; Blumenson p.165 |
| 7th Armd Div | round Vesuvius to the east and north towards Capua **(uncertain exact place)** | 40.873, 14.437 (Somma Vesuviana) | 2526/2527 (Somma Vesuviana, Ottaviano) | Blumenson p.165 |
| 46th Div | behind 7th Armd from Nocera **(uncertain)** | 40.75, 14.633 | enters T1 from S1 | Molony V p.343 |
| 56th Div | S. Severino and Castel S. Giorgio on 28 Sept; sent north on 30 Sept; met the US 3rd Div on 2 Oct **(uncertain exact place)** | 40.783, 14.75 | 169 and 201 at 2727 (Nola); 167 enters T1 | Molony V p.343; Blumenson pp.165-166 |
| 3rd Div (+751, 601) | **Avellino**, turning west | 40.917, 14.789 | 2926/3026 (Avella) | Blumenson p.162 |
| 133rd Inf + 100th Bn | cutting the Avellino-Benevento road north of Highway 7; 3/133 entered Benevento 23:30, 2 Oct **(uncertain exact place)** | 41.008, 14.782 (Altavilla Irpina) | 133 at 3626 (Altavilla Irpina/Benevento); 100th T2 | Blumenson p.162; AFIA p.89 |
| 135th, 168th Inf | ashore near Paestum; to Montesarchio in the first week of October **(uncertain)** | 40.422, 15.005 | T4 from S2 | Blumenson p.166 |
| 45th Div (+191, 645, 756) | line Avellino-Montemarano-Teora, sent on Benevento; its recon troop took the town 12:10, 2 Oct **(uncertain exact place)** | 40.916, 14.998 (Montemarano) | 157 and 191 at 3726 (Benevento); 179, 180, 645, 756 T2 | Starr p.35; AFIA p.89 |
| 36th Div (+753, 636) | Army reserve at the Salerno beaches; one regiment readied for a landing at Torre Annunziata | 40.422, 15.005 | off map, returns T17-18 | Starr p.33; Blumenson p.164 |
| Ranger Force | under the 82nd on the Sorrento ridge to Castellammare; into Naples 2 Oct | 40.695, 14.480 | off map; return T12/T14/T20 | Blumenson p.165; Starr p.35 |
| 2/509th | scattered after the Avellino drop **(uncertain)** | - | off map; returns T15 | Blumenson pp.131-132 |

Verdict: Italy '43's 1 October set-up agrees with the record. Its forward hexes for the 3rd Div (Avella) and the 45th
(Benevento) sit a day or two ahead of 1 October, which suits a 1-2 Oct turn. Its S1/S2 entries are the X Corps and VI Corps
rear echelons still coming up from the Salerno map. In the grand campaign those units are already on the joined map, so they
are **not** reinforcements.

### October - December

- **Volturno**: 10 Corps closed up to the river by 7 Oct and VI Corps by 6 Oct; Benevento (41.133, 14.783) fell on 2 Oct
  (Blumenson p.166). The crossings went in on the night of 12/13 Oct, the 7th Armd at Grazzanise (Blumenson pp.204-205). On 24-28 Oct
  McCreery swapped the zones of the 7th Armd and the 46th (Blumenson p.215).
- **168 Bde** rejoined the 56th Div on 17 Oct (Wikipedia, 56th Div, citing Joslen) **(uncertain)**; Italy '43 has it at Naples T5.
- **Italian 1st Motorized Group**: under Fifth Army from 31 Oct, training at Avellino and Limatola (41.15, 14.40) (Starr p.53).
- **Early November**: VI Corps crossed the upper Volturno on 3-4 Nov to Venafro (41.484, 14.046) (Blumenson p.222). The 4th Rangers
  went in on the night of 2/3 Nov, the 1st Rangers on 8-10 Nov and 2/509th on 11 Nov at Monte Corno and Mt Santa Croce, and the 504th
  covered the right at Colli (Starr pp.51-52). The attack halted on 15 Nov (Starr p.53).
- **Mid-November changes**:
  - The 7th Armd was withdrawn for Overlord from 14 Nov (Molony V p.475) and was off the Fifth Army list on 15 Nov
    (Blumenson p.251); it left Italy in late December (Wikipedia).
  - The 82nd Abn, less the 504th, left in mid-November for the UK (Starr p.53; Blumenson p.186). A web-search summary of the
    Airborne Museum timeline (not on an allowed host, not fetched) gives sailing 18 Nov and Belfast 9 Dec **(uncertain)**.
  - The 1st Armd came under Fifth Army on 15 Nov (Blumenson p.251).
  - The **36th Div relieved the 3rd** at Mignano (41.40, 13.983) on 16-17 Nov, and **II Corps** (Keyes) took over on 18 Nov (Blumenson p.251).
  - The French Increment reached Naples on 18 Nov, the **2e DIM began unloading on 20 Nov** and the CEF HQ flew in on 25 Nov
    (Blumenson p.254, read on the page image).
  - The **1st SSF** reached Naples on 17 Nov (Wikipedia) and was attached to II Corps on 23 Nov (Blumenson p.255).
  - The Italian group moved to near Capua (41.106, 14.214) on 22 Nov (Blumenson p.253).
- **December**:
  - Operation Raincoat began on 2-3 Dec: 10 Corps on Monte Camino, II Corps and the 1st SSF on Monte la Difensa
    (41.383, 13.933) (Starr pp.60, 64).
  - San Pietro (41.45, 13.967) was fought on 8-17 Dec. The 3rd Rangers took Hill 950, the Italians attacked Monte Lungo on
    8 and 16 Dec, and the 504th relieved the Rangers (Starr pp.66-70).
  - The **2e DIM relieved the 34th Div** on 8-13 Dec, Dody taking over on 10 Dec, in the Scapoli-Pantano sector (Starr p.71;
    Wikipedia). The 34th came back on about 29 Dec to relieve the 36th (Starr p.71).
  - **No. 9 Commando** raided north of the Garigliano mouth (41.223, 13.762) on the night of 29/30 Dec (Starr p.71).
- **X Corps changes**: the 7th Armd left, 168 Bde returned and 11 KRRC joined 23 Armd Bde (Italy T17). The October plan to
  pass X Corps to Eighth Army was dropped (Starr p.53; Blumenson p.251). The British 1st and 5th Divisions were expected
  (Blumenson p.251; Molony V p.475).

All dated arrivals and withdrawals, with lat/lon, are in `fifth-army.json` (`arrivals`, `withdrawals`).

## 3. German units in both games (brief; covered in depth elsewhere)

Same unit in both games: the Hermann Göring Division (recon, II/1, I/2, I+II and III Pz battalions, ASU); III/115 and the
129th PG Regt, which is one 6-9-5 counter in Salerno and three 2-3-5 battalions in Italy, plus 215 Pz Abt (values differ:
2-2-5 against 4-3-5); II/64 of the 16th Pz (the rest of the 16th Pz leaves on Salerno T14); and the 26th Pz (recon, I/9,
II/9, I/67, II/67, ASU). The 29th PG matches as I/II/III-15 = 15th PG Regt, 71 Regt(-) + I/71 = 71st Regt, Recon Abt 129,
129 Pz Abt (2-2-5 against 3-2-5) and its ASU. Also in both: the 3rd PG's II/29 and 103 Pz Abt (2-2-5 against 3-2-5),
III/1 FJ, 71 Nebelwerfer and the XIV Pz Corps ASU. Salerno only: 8/26 Pz, the LXXVI Pz Corps ASU, the other 1 FJ
battalions (Adriatic), the garrisons and most of the 16th Pz. The mapping is in `germanContinuity` in the JSON.

## 4. Turn track: Salerno's days on a 2-3 day track

Proposal: **2-day turns from 9 Sept to 10 Oct, then Italy '43's own track unchanged.**

- GT1 = 9-10 Sept ... GT11 = 29-30 Sept, so **GT = ceil(Salerno turn / 2)**.
- GT12 = Italy T1 (1-2 Oct) ... GT43 = Italy T32 (29-31 Dec), so **GT = Italy turn + 11**. That makes 43 turns.
- Italy's first five turns (1-10 Oct) are already 2-day turns, so the turn length changes only once, at 11 Oct.
- Both games move the German first. A reinforcement dated on either day of a 2-day turn enters in that turn's Allied phase,
  so it is never more than a day early. To be never early instead, delay the odd-turn Salerno arrivals by one turn.

| Salerno event (turn, day) | GT |
|---|---|
| D-Day landings (T1, 9 Sept); 45th Div's 179th and 157th, VI and X Corps ASUs, 601/751/753, 3/531, 139 Bde (T2, 10 Sept) | 1 |
| 504th drop (T5, 13/14); 180th, 505th, 2/509th (T6, 14 and 14/15) | 3 |
| 2/157, 131 Bde (T7); 325th, 3/504, 5 RTR, battleships, end of the Avalanche scenario (T8) | 4 |
| 756th, 11th Hussars (T9); 30th Inf, 7 Armd ASU (T10) | 5 |
| 22 Armd Bde, Eighth Army at the south edge (T11); 7th Inf (T12) | 6 |
| 15th Inf, 3 Div ASU (T13); 133rd, 100th; 16 Pz withdrawal (T14) | 7 |
| KDG (T16) | 8 |
| 135th (T18) | 9 |
| 168th (T19), 34 Div ASU (T20) | 10 |
| last Salerno turn (T22, 30 Sept) | 11 |
| Italy at-start / Volturno scenario (T1) | 12 |
| Bernhard Line scenario start (Italy T13, 1-3 Nov) | 24 |

Continuity rules that follow:

1. From GT12, ignore Italy's "arrive T1/T2/T4 at S1/S2" for the 46th, 167 Bde, 45th (179, 180, 645, 756), 100th,
   34th (135, 168, ASU) and the corps and division ASUs. They are the Salerno counters already on the map.
2. The genuinely new Italy units keep their turns + 11. The list is in `turnMapping`.
3. The Rangers, 2/509th and 36th Div are on the map in September but off it on 1 Oct in Italy '43. Send them to a refit box
   at the historical date: the 36th on 20 Sept (GT6), the Rangers after Naples (GT12). Bring them back on Italy's turns
   (+11), or leave them on the map frozen until then.
4. Remove the Commandos in GT5. Fold the Salerno breakdown counters in at GT12. Retire the beach units when the beaches
   close (14 Oct, GT18 for the US beaches).

## 5. Gaps

- The exact positions of the 46th, 56th, 7th Armd, 45th and the 133rd on 1 Oct are known only to within a few miles
  (marked uncertain).
- The landing day of the 7th Armd (14 or 15 Sept) and of the 325th and 3/504 (15 or 16 Sept).
- The numbering of the 157th's late battalion: Blumenson's 1st Bn against AFIA and the game's 2nd Bn.
- The 82nd's sailing date (18 Nov) comes only from a web-search summary of a non-Wikipedia site.
- Not verified at all: arrival dates for the 755th, 760th and 776th, the 91st Recon, 11 KRRC, 168 Bde (Joslen via
  Wikipedia only) and the KDG's September landing day.
- Ranger withdrawal dates in December are the game's (T20, T22, T27), not checked against the record.
- The Wikipedia date for the Italian group (formed 27 Nov) disagrees with Starr (under Fifth Army 31 Oct).
- Molony V was searched by keyword, not read through. The multi-part *Fifth Army History* was not found on archive.org;
  Starr's one-volume history stands in for it.
