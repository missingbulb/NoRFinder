#!/usr/bin/env python3
"""Regenerate figures/panels/*.png from the full figure PNGs in this dir.
Grids located from figure gutters (see panels/README.md). Requires Pillow."""
from PIL import Image
import os

OUT = 'panels'; M = 4  # inner trim (px) to avoid gutter bleed
os.makedirs(OUT, exist_ok=True)
def crop(fn, x0, x1, y0, y1, out):
    Image.open(fn).crop((x0+M, y0+M, x1-M, y1-M)).save(os.path.join(OUT, out))

# Fig 1 (1500x1122): bottom strip C1..C4, y 745-1121, 4 cols /375
f='fig1_gP-CD31_Nissl_healthy.png'; cols=[0,375,750,1125,1500]
for i,nm in enumerate(['VESSEL_fig1_C1_healthy_gP-CD31_red','fig1_C2_healthy_Nissl_green',
                       'fig1_C3_healthy_3D_merge','fig1_C4_healthy_3D_vessels']):
    crop(f, cols[i], cols[i+1], 745, 1121, nm+'.png')

# Fig 3 (1498x2362): middle grid 3 rows x 5 cols (black gutters -> even split)
f='fig3_gP-CD31_Nissl_ischemic.png'
xs=[0,300,600,899,1199,1498]; ys=[899,1196,1493,1790]
cd=['merge','gP-CD31_red','Nissl_green','3D_merge','3D_vessels']
for r,rn in enumerate(['ischemic','penumbra','contralateral']):
    for c,d in enumerate(cd):
        pre='VESSEL_' if d=='gP-CD31_red' else ''
        crop(f, xs[c], xs[c+1], ys[r], ys[r+1], f'{pre}fig3_{rn}_{d}.png')

# Figs 4/5/6: 5-col grid (white gutters), 4 rows A-D
xs4=[0,352,707,1062,1418,1771]; regions=['normal','ischemic','penumbra','contralateral']
for f,marker,rys in [
    ('fig4_gP-CD31_vs_mM-CD31.png','mM-CD31',[0,354,710,1065,1411]),
    ('fig5_gP-CD31_vs_phalloidin.png','phalloidin',[0,359,715,1072,1413]),
    ('fig6_gP-CD31_vs_aSMA.png','aSMA',[0,355,710,1066,1411])]:
    rys=rys+[rys[-1]+346]; tag=f.split('_')[0]
    cd=['overview','merge','gP-CD31_red',marker+'_green','3D']
    for r,rn in enumerate(regions):
        for c,d in enumerate(cd):
            pre='VESSEL_' if d=='gP-CD31_red' else ''
            crop(f, xs4[c], xs4[c+1], rys[r], rys[r+1], f'{pre}{tag}_{rn}_{d}.png')

# Fig 7: 5-col grid, 3 rows A-C (3-D correlation)
f='fig7_spatial_correlation_3D.png'; ys7=[0,357,712,1061]
c7=['3D_all','gP-CD31','gP-CD31+phalloidin','gP-CD31+aSMA','phalloidin+aSMA']
for r,rn in enumerate(['penetrating_artery_long','capillaries','penetrating_artery_transverse']):
    for c,d in enumerate(c7):
        crop(f, xs4[c], xs4[c+1], ys7[r], ys7[r+1], f'fig7_{rn}_{d}.png')

print('done')
