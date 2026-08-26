"""The specimen data. Neutral mathematics — deliberately NOT the exam's items,
so the design system can be judged, published and shared without any exam
content leaving the workshop."""
import json

def samples(f, a, b, step):
    out, x = [], a
    while x <= b + 1e-9:
        out.append([round(x, 4), round(f(x), 4)]); x += step
    return out

def circle(cx, cy, r, n=12):
    import math
    return [[round(cx + r*math.cos(2*math.pi*i/n), 3),
             round(cy + r*math.sin(2*math.pi*i/n), 3)] for i in range(n)]

SCATTER = [[1,14],[2,19],[3,17],[4,24],[5,26],[6,25],[7,31],[8,34]]
def fit(pts):
    n=len(pts); mx=sum(p[0] for p in pts)/n; my=sum(p[1] for p in pts)/n
    b=sum((p[0]-mx)*(p[1]-my) for p in pts)/sum((p[0]-mx)**2 for p in pts)
    a=my-b*mx
    return [[0.5, round(a+b*0.5,3)], [8.5, round(a+b*8.5,3)]]

SPECIMENS = [
 dict(id='fn', kind='plot', tag='plot', name='Function graph',
      why='A sampled smooth curve. The samples are hidden on purpose — visible dots invite reading the answer off the sampling instead of off the curve.',
      spec=dict(xRange=[-0.5,4.7], yRange=[-1,5], xLabel='x', yLabel='y',
                curves=[dict(label='y = f(x)', points=samples(lambda x: x**3/3 - 2*x**2 + 3*x + 1, -0.3, 4.6, 0.35))]),
      opts=dict(aspect='plane', figures=[dict(mode='curve')])),

 dict(id='lines', kind='plot', tag='plot', name='Two straight lines',
      why='Straight segments, never smoothed. Equal axis scales, so a slope of 2 looks like a slope of 2.',
      spec=dict(xRange=[-1,5], yRange=[-3,5], xLabel='x', yLabel='y',
                curves=[dict(label='m = 2', points=[[-1,-5],[4,5]]),
                        dict(label='m = -1', points=[[-1,4],[5,-2]])]),
      opts=dict(aspect='plane', figures=[dict(mode='polygon'), dict(mode='polygon')])),

 dict(id='parab', kind='plot', tag='plot', name='Parabola',
      why='Joining these five points with straight lines would draw a V. The word in the prompt is "parabola", so the figure has to be one.',
      spec=dict(xRange=[-2,4], yRange=[-5,5], xLabel='x', yLabel='y',
                curves=[dict(label='y = x² − 2x − 3', points=samples(lambda x: x*x-2*x-3, -1.6, 3.6, 0.4))]),
      opts=dict(aspect='plane', figures=[dict(mode='curve')])),

 dict(id='circle', kind='plot', tag='plot', name='Circle',
      why='Closed, smoothed and drawn on a square grid. Unequal axes would make it an ellipse; unclosed sampling would leave a gap.',
      spec=dict(xRange=[-1.5,5.5], yRange=[-2.5,4.5], xLabel='x', yLabel='y',
                curves=[dict(label='circle', points=circle(2,1,3))]),
      opts=dict(aspect='plane', figures=[dict(mode='curve', closed=True)])),

 dict(id='tri', kind='plot', tag='plot', name='Right triangle',
      why='Coordinate geometry with no diagram language: the side lengths are counted off the grid. A right angle must look like one.',
      spec=dict(xRange=[-1,5.5], yRange=[-1,4.5], xLabel='x', yLabel='y',
                curves=[dict(label='triangle', points=[[0,0],[4,0],[4,3],[0,0]])]),
      opts=dict(aspect='plane', figures=[dict(mode='polygon')])),

 dict(id='pts', kind='plot', tag='plot', name='Named points',
      why='Names the prompt refers to are drawn on the figure, with the surface painted around each glyph so it survives a gridline underneath.',
      spec=dict(xRange=[-3,5], yRange=[-2,4], xLabel='x', yLabel='y',
                curves=[dict(label='A, M, B', points=[[-2,3],[1,1],[4,-1]])]),
      opts=dict(aspect='plane', figures=[dict(mode='points', labels=['A','M','B'])])),

 dict(id='scatter', kind='plot', tag='plot', name='Scatter',
      why='Never joined, and never given a trend line the prompt did not ask for. Axes measure different quantities, so this one is not squared.',
      spec=dict(xRange=[0,9], yRange=[10,36], xLabel='Weeks', yLabel='Books read',
                curves=[dict(label='students', points=SCATTER)]),
      opts=dict(aspect='data', figures=[dict(mode='scatter')])),

 dict(id='fitline', kind='plot', tag='plot', name='Scatter with a line of best fit',
      why='When the prompt says a line is drawn, the line is drawn. Identity here is carried by FORM — dots against a dashed line — not by colour alone.',
      spec=dict(xRange=[0,9], yRange=[10,36], xLabel='Weeks', yLabel='Books read',
                curves=[dict(label='students', points=SCATTER),
                        dict(label='line of best fit', points=fit(SCATTER))]),
      opts=dict(aspect='data', figures=[dict(mode='scatter'), dict(mode='polygon', dashed=True)])),

 dict(id='bar', kind='chart', tag='chart', name='Bar chart',
      why='Rounded only at the data end, square at the baseline, with a 2 px gap so adjacent bars never fuse.',
      spec=dict(chartType='bar', yLabel='Students',
                categories=['Mon','Tue','Wed','Thu','Fri'],
                series=[dict(name='Attended', values=[18,24,21,27,15])])),

 dict(id='linechart', kind='chart', tag='chart', name='Line chart, two series',
      why='Two series always carry a keyed legend, so identity is never colour alone.',
      spec=dict(chartType='line', yLabel='Score',
                categories=['Jan','Feb','Mar','Apr','May','Jun'],
                series=[dict(name='Class A', values=[52,58,57,64,69,72]),
                        dict(name='Class B', values=[61,60,66,65,71,74])])),

 dict(id='table', kind='table', tag='table', name='Table',
      why='Numerals are mono and right-aligned so columns compare by eye; text stays left. One rule under the header, hairlines between rows, no box.',
      spec=dict(headers=['Item','Price (EGP)','Discount'],
                rows=[['Notebook','48','15%'],['Backpack','320','10%'],['Pen set','96','25%']])),

 dict(id='tablenote', kind='table', tag='table', name='Table with a key',
      why='The note is not a caption — without the key the data cannot be read at all, so it sits with the table and is part of its meaning.',
      spec=dict(headers=['Stem','Leaf'],
                rows=[['3','2  5  8'],['4','0  1  4  7'],['5','3  6']],
                note='Key: 3 | 2 means 32 minutes')),

 dict(id='nl1', kind='number_line', tag='number_line', name='Number line, mixed endpoints',
      why='Open against closed is the difference between < and ≤. It is the whole question, so it is drawn at a size nobody has to squint at.',
      spec=dict(min=-6, max=6, segments=[dict()])),

 dict(id='nl2', kind='number_line', tag='number_line', name='Number line, unbounded ray',
      why='A segment that reaches the edge of the visible range ends in an arrow, not a stop.',
      spec=dict(min=-6, max=6, segments=[dict()])),

 dict(id='nl3', kind='number_line', tag='number_line', name='Number line, plotted points',
      why='Individual values on the line, at the same weight as a closed endpoint.',
      spec=dict(min=-6, max=6, points=[-4,-1,3])),
]
# the two segment specs, written out (dict() above is a placeholder to keep the
# table readable)
SPECIMENS[12]['spec']['segments']=[dict(**{'from':-3,'to':4,'fromClosed':False,'toClosed':True})]
SPECIMENS[13]['spec']['segments']=[dict(**{'from':-1,'to':6,'fromClosed':True,'toClosed':True})]
