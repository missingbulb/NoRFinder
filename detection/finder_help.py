"""What the page says about each finder and each setting: a few sentences per finder (ABOUT) and
one line per parameter (HELP). tests/test_interactive.py fails when a finder or a parameter the
page shows has no entry here, so a new setting arrives with its explanation.

"unit" is the image's own scale: the median half-length of a green blob, so sizes follow the image
rather than its pixel count."""

ABOUT = {
    'tl': "Slides a green-red-green stencil over the whole image at every angle and a few spacings, "
          "and marks the spots where all three windows show their own colour. Only spots with both "
          "greens already in place become candidates; then the red and the two greens under the "
          "stencil are coloured in.",
    'rf': "Starts from the red alone: finds every red spot and grows it outwards while it stays "
          "compact. Every green blob touching the red is a possible paranode, and any two on opposite "
          "sides make a candidate, so one red can give several. The best candidate that passes the "
          "filters wins, and no pixel belongs to two NoRs.",
    'fill': "Starts at each bright red dot, turns to face along the fibre (the way with green on both "
            "sides), and walks out each way until it lands on the brightest green. Then colours in the "
            "red and both greens from their peaks, stopping where each drops below a fraction of its "
            "own peak.",
    'walk': "Starts at each red peak, picks the direction with green on both sides, then walks along "
            "that line in a narrow strip: through the red first, then onto the green on each side.",
    'blobs': "The simplest finder: every red blob is paired with the green blobs that touch it. Fast, "
             "but it misses greens that do not quite touch the red.",
}

HELP = {
    # telling colours apart (every finder)
    'green_frac': "Share of the image's pixels that may count as green (the brightest ones). Raise it to pick up fainter paranodes.",
    'red_frac': "Share of the image's pixels that may count as red (the brightest ones). Raise it to pick up fainter nodes.",
    'smooth': "Blur (pixels) before pixels are sorted into green and red. 0 = none; blur smears red into green.",
    'min_red': "Smallest red blob kept, in pixels.",
    'min_green': "Smallest green blob kept, in pixels. Also decides which blobs set the unit.",
    'touch': "A green must come this close to the red, in pixels, to belong to it.",
    'reach_u': "A green segment is cut off this far from the red centre (units).",
    'rim': "Pixels next to the other colour left out when purity is measured, since blur makes that rim yellow.",
    # the shared machinery of fill, traffic light and red-first
    'smooth_u': "Blur (units) used to find peaks and directions. More blur merges nearby spots.",
    'nms_u': "Two peaks closer than this (units) count as one.",
    'strip_u': "Half-width (units) of the strip walked along the fibre.",
    'touch_u': "A green counts as touching the red if it comes this close (units).",
    'angle_step': "Degrees between the directions tried when looking along the fibre.",
    'bend': "Largest bend (degrees) allowed on each side of the node.",
    'half': "A blob is coloured in down to this fraction of its own peak brightness.",
    'own_side': "Colour each green only on its own side of the red.",
    'comb_u': "Size (units) of the patch used to measure which way the fibre runs.",
    'comb_window': "Directions tried lie within this many degrees of the measured fibre direction (90 or more = all).",
    'fg': "Nothing dimmer than this many colour levels is coloured in.",
    'valleys': "Stop colouring at a dip between two green hills, so one green cannot swallow its neighbour.",
    'valley_depth': "How deep a dip must be (in colour levels) to split two hills.",
    'min_area_u2': "Smallest red kept, in square units.",
    'min_green_u2': "Smallest green kept, in square units.",
    'snap_u': "Distance (units) the landing spot may move to reach the true peak.",
    'green_dom': "A pixel is coloured green only where green is at least this many times the red.",
    # traffic light
    'win_u': "Size (units) of each stencil window.",
    'd_u': "Distances (units) tried between the red window and each green window.",
    'n_ang': "Number of angles the stencil is turned to.",
    's_min': "How well all three windows must match (in colour levels) for a spot to become a candidate.",
    'dip': "If above 0, the midpoints between the red and each green window must be lit too (no dark gap). 0 = off.",
    'g_reach_u': "A paranode stops this far (units) from where it meets the red.",
    'g_weak': "Below 1, the fainter green window may be dimmer than the other two and still match fully.",
    # red-first
    'red_steps': "Brightness levels (fractions of the red peak) the red is grown down to, one by one.",
    'min_rect': "How rectangular the red must stay while growing. 0 = off.",
    'max_perim': "How ragged the red's outline may get while growing. 99 = off.",
    'g_low': "Faintest green hill (in green levels) that can still be a paranode.",
    'red_dom': "Trim the red to pixels where red outshines green.",
    'trim': "When two NoRs overlap, let one give up the tip of a green the other owns.",
    'far_u': "When only one side has green, look this far (units) for the missing paranode. 0 = off.",
    'far_cone': "Half-width (degrees) of the cone searched opposite the known green.",
    'gap_level': "The line from the red to that far green must stay this bright (colour levels).",
    'blue': "'post': nuclei are removed after finding (the page's way). 'pre': blanked before finding.",
    'multi': "Try every pair of greens around a red, not just the first found.",
    'split': "Split a green hill that touches the red on two sides.",
    'nucleus_rule': "'red': a NoR is in a nucleus when its red is. 'all': judged on all its pixels.",
    # walk
    'strip': "Half-width (pixels) of the strip walked along the fibre.",
    'max_green_u': "Longest green segment (units) walked onto.",
    'seed_smooth': "Blur (pixels) before red peaks are picked as starting points.",
    'seed_nms': "Two red starting points closer than this (pixels) count as one.",
    'band_u': "Half-width (units) of the band a green must sit in.",
    'hyst': "Keep walking while the colour stays above this fraction of its threshold.",
    # filters
    'min_green_balance': "The weaker green must be at least this fraction of the stronger one.",
    'min_snr': "The dimmest of the three segments must stand this many noise levels above its surroundings.",
    'purity': "Largest share of a segment's pixels that may be lit in the other colour.",
    'min_opposite': "The angle green-red-green must be at least this straight (degrees; 180 = a straight line).",
    'max_off_u': "Largest distance (units) of the red from the line between the greens.",
    'max_axis_dev': "Largest angle (degrees) between the NoR and the fibre direction.",
    'min_aspect': "Length over mean width must be at least this: a NoR is a stick, not a round blob.",
    'min_solid': "Share of the line along the NoR that must be covered by the NoR itself (1 = no gaps).",
    'nucleus_frac': "A NoR is rejected when at least this share of its red lies on a nucleus (the blue mask).",
    'max_shared': "A NoR is rejected as a duplicate when a stronger NoR already owns its red, or more than this share of either green.",
}
