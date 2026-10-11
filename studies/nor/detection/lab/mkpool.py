# build a stratified pool of locations to label by eye, and raw tile sheets (no overlays)
import numpy as np, nor3, naive_nor as nn_, json
from PIL import Image, ImageDraw
T='/home/user/missingbulb/norfinder/data/raw/Left Up- Edited/Slide5_4AP_NoR.sld - Slice1_up_left2.tif'
c,n,u,d=nn_.load(T); bm=nn_.blue_mask(d)
pts=[]
for fn,P in [(nor3.segment_fill,nor3.P3),(nor3.segment,nor3.P)]:
    cs,_=fn(c,n,bm,P)
    for x in cs:
        if x['fail'] in (None,'one green','greens unequal brightness','red impure','not in a line','dim','not stick-like','green impure','shares a segment','greens joined'):
            pts.append((x['cx'],x['cy'],x['fail'] is None))
pts=np.array(pts,float)
# dedupe within 4 px
keep=[]
for p in pts[np.argsort(-pts[:,2])]:
    if all(np.hypot(p[0]-q[0],p[1]-q[1])>4 for q in keep): keep.append(p)
keep=np.array(keep); rng=np.random.default_rng(1)
pas=keep[keep[:,2]==1]; rej=keep[keep[:,2]==0]
sel=np.vstack([pas[rng.choice(len(pas),80,replace=False)], rej[rng.choice(len(rej),120,replace=False)]])
sel=sel[rng.permutation(len(sel))]
json.dump([[float(a),float(b)] for a,b,_ in sel],open('pool.json','w'))
rgb=np.asarray(Image.open('out/redgreen.png'))
S=24;Z=3;cols=10;cell=S*Z
for part in range(0,len(sel),50):
    ss=sel[part:part+50]; R=(len(ss)+cols-1)//cols
    sh=Image.new('RGB',(cols*(cell+3),R*(cell+3)),(60,60,60)); dr=ImageDraw.Draw(sh)
    for k,(x,y,_) in enumerate(ss):
        t=np.zeros((S,S,3),np.uint8); x0,y0=int(x)-S//2,int(y)-S//2
        ys0,xs0=max(0,y0),max(0,x0); ys1,xs1=min(1200,y0+S),min(1200,x0+S)
        t[ys0-y0:ys1-y0,xs0-x0:xs1-x0]=rgb[ys0:ys1,xs0:xs1]
        im=Image.fromarray(t).resize((cell,cell),Image.NEAREST); di=ImageDraw.Draw(im)
        m=cell//2; di.line([(m-6,2),(m+6,2)],fill=(255,255,255)); di.line([(m-6,cell-3),(m+6,cell-3)],fill=(255,255,255))  # centre ticks
        di.line([(2,m-6),(2,m+6)],fill=(255,255,255)); di.line([(cell-3,m-6),(cell-3,m+6)],fill=(255,255,255))
        i,j=divmod(k,cols); sh.paste(im,(j*(cell+3),i*(cell+3))); dr.text((j*(cell+3)+2,i*(cell+3)+1),str(part+k),fill=(255,255,0))
    sh.save(f'pool_{part//50}.png')
print(len(sel), len(pas), len(rej))
