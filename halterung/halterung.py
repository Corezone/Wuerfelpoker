#!/usr/bin/env python3
"""
Würfelpoker – Handy-Halterung für die Kamera-Erkennung
=======================================================
Das Handy liegt mit dem Display nach oben in der Ablage, die Rückkamera
schaut durch ein Fenster senkrecht nach unten auf die Würfel.

Teile (alle passen auf ein 220 × 220 mm Druckbett):
  1_fuss_unterteil.stl   hohler Fuß zum Beschweren (Sand, Reis, Münzen …)
  2_fuss_deckel.stl      Deckel mit Steckhülse für die Säule
  3_saeule.stl           Säulenteil – 3× drucken (2× für eine niedrigere Halterung)
  4_arm.stl              Arm, wird oben auf die Säule gesteckt
  5_ablage.stl           Handy-Ablage mit Kamerafenster

Benötigt:  pip install manifold3d trimesh numpy
Aufruf:    python3 halterung.py
Maße unten anpassen, z. B. für ein anderes Handy oder eine dicke Hülle.
"""
from manifold3d import Manifold, CrossSection, JoinType
import trimesh, os

# ---------------- Maße (mm) ----------------
HANDY_L, HANDY_B, HANDY_D = 163.6, 78.1, 7.9   # Samsung Galaxy S26 Ultra
HUELLE = 3.0          # Luft pro Seite für eine Hülle (ohne Hülle: 1.0)
WAND = 2.4            # Wandstärke der Ablage
FENSTER_L = 62        # Länge des Kamerafensters (am oberen Handyende)

ROHR_D = 20.0         # Außendurchmesser der Säule
SPIEL = 0.4           # Passungsspiel für Steckverbindungen
SEGMENT_L = 125       # Länge eines Säulenteils
ZAPFEN_D, ZAPFEN_L = 10.6, 16   # Steckzapfen zwischen den Säulenteilen
BOHRUNG_D = 11.0

FUSS = 170            # Kantenlänge des Fußes
FUSS_H = 24           # Höhe des Unterteils
ARM_L = 110           # Abstand Säulenmitte → Ablage
ARM_B, ARM_H = 22, 14  # Querschnitt des Arms

FN = 96
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'stl')
os.makedirs(out, exist_ok=True)

def box(x, y, z, center_xy=True):
    m = Manifold.cube([x, y, z])
    return m.translate([-x / 2, -y / 2, 0]) if center_xy else m

def rbox(x, y, z, r):
    """Quader mit abgerundeten senkrechten Kanten."""
    cs = CrossSection.square([x - 2 * r, y - 2 * r], center=True).offset(r, JoinType.Round, circular_segments=48)
    return cs.extrude(z)

def cyl(d, h, z0=0):
    return Manifold.cylinder(h, d / 2, circular_segments=FN).translate([0, 0, z0])

def save(m, name):
    mesh = m.to_mesh()
    t = trimesh.Trimesh(vertices=mesh.vert_properties[:, :3], faces=mesh.tri_verts)
    assert t.is_watertight, name + ' ist nicht geschlossen'
    t.export(os.path.join(out, name))
    ext = t.bounds[1] - t.bounds[0]
    print(f'{name:24s} {ext[0]:6.1f} × {ext[1]:6.1f} × {ext[2]:6.1f} mm   {t.volume / 1000:6.1f} cm³')
    return t

# ---------------- 1) Fuß-Unterteil ----------------
huelse_aussen = ROHR_D + SPIEL + 13
unter = rbox(FUSS, FUSS, FUSS_H, 12) - rbox(FUSS - 6, FUSS - 6, FUSS_H, 9).translate([0, 0, 2.4])
unter += cyl(huelse_aussen, FUSS_H) - cyl(ROHR_D + SPIEL, FUSS_H, 2.4)
for sx in (-1, 1):                                   # Eckblöcke mit Passstiften für den Deckel
    for sy in (-1, 1):
        cx, cy = sx * (FUSS / 2 - 11), sy * (FUSS / 2 - 11)
        unter += box(14, 14, FUSS_H).translate([cx, cy, 0])
        unter += cyl(5, 4, FUSS_H).translate([cx, cy, 0])
for sx in (-1, 1):                                   # flache Mulden für Gummifüße (Ø 12)
    for sy in (-1, 1):
        unter -= cyl(12.5, 1.2).translate([sx * (FUSS / 2 - 22), sy * (FUSS / 2 - 22), 0])

# ---------------- 2) Fuß-Deckel ----------------
DECKEL_T = 3
deckel = rbox(FUSS, FUSS, DECKEL_T, 12)
deckel += cyl(huelse_aussen, 30, DECKEL_T)
def rippe(lang, hoch, dick):
    """Senkrechte Dreiecksrippe, beginnt bei x=0 (innen hoch, außen flach)."""
    tri = CrossSection([[(0, 0), (lang, 0), (0, hoch)]])
    return tri.extrude(dick).rotate([90, 0, 0]).translate([0, dick / 2, 0])
for a in range(0, 360, 90):                           # Versteifungsrippen
    deckel += rippe(32, 26, 4).translate([huelse_aussen / 2 - 1, 0, DECKEL_T]).rotate([0, 0, a + 45])
deckel -= cyl(ROHR_D + SPIEL, 40, -1)
for sx in (-1, 1):
    for sy in (-1, 1):
        deckel -= cyl(5.5, 5, -1).translate([sx * (FUSS / 2 - 11), sy * (FUSS / 2 - 11), 0])

# ---------------- 3) Säulenteil (gedruckt: Bohrung unten, Zapfen oben) ----------------
saeule = cyl(ROHR_D, SEGMENT_L) - cyl(BOHRUNG_D, SEGMENT_L - 7, -0.01)
saeule += cyl(ZAPFEN_D, ZAPFEN_L, SEGMENT_L)
saeule -= cyl(ZAPFEN_D + 2, 1.2, SEGMENT_L + ZAPFEN_L - 1.2) - cyl(ZAPFEN_D - 1.2, 1.2, SEGMENT_L + ZAPFEN_L - 1.2)  # Fase am Zapfen

# ---------------- 4) Arm (gedruckt kopfüber: Kappe unten) ----------------
KAPPE = 4
manschette = cyl(huelse_aussen, 42) - cyl(ROHR_D + SPIEL, 42, KAPPE)
balken = box(ARM_L, ARM_B, ARM_H, center_xy=False).translate([0, -ARM_B / 2, 0])
zapfen_arm = box(30, ARM_B - 2 * SPIEL - 6, ARM_H - 2 * SPIEL - 4, center_xy=False).translate([ARM_L, -(ARM_B - 2 * SPIEL - 6) / 2, 2 + SPIEL])
arm = manschette + balken + zapfen_arm
arm += rippe(46, 22, 5).translate([huelse_aussen / 2 - 1, 0, ARM_H])     # Stützrippe zwischen Manschette und Arm
arm -= cyl(3.2, 20, 0).rotate([90, 0, 0]).translate([0, huelse_aussen, 25])  # Loch für Klemmschraube M3 (optional)

# ---------------- 5) Ablage ----------------
IL, IB = HANDY_L + 2 * HUELLE, HANDY_B + 2 * HUELLE
AL, AB, BODEN = IL + 2 * WAND, IB + 2 * WAND, 3
ablage = rbox(AL, AB, BODEN + 12, 6) - rbox(IL, IB, 20, 4).translate([0, 0, BODEN])
ablage -= box(AL - 40, AB + 2, 20).translate([0, 0, BODEN + 6])          # Seitenwände niedrig → Tasten frei
ablage -= rbox(FENSTER_L, IB - 10, 10, 6).translate([AL / 2 - WAND - FENSTER_L / 2 - 4, 0, -1])   # Kamerafenster
ablage -= rbox(70, IB - 34, 10, 14).translate([-AL / 2 + 55, 0, -1])     # Material sparen
ablage -= box(16, 30, 20).translate([-AL / 2, 0, BODEN])                  # Kabeldurchlass (USB-C)
huelse = box(36, ARM_B + 6, ARM_H + 6).translate([-AL / 2 - 18 + 1, 0, 0])
huelse -= box(34, ARM_B - 6, ARM_H - 4).translate([-AL / 2 - 18 - 1, 0, 2])
ablage += huelse

print('Erzeuge STL-Dateien …')
parts = [(unter, '1_fuss_unterteil.stl'), (deckel, '2_fuss_deckel.stl'), (saeule, '3_saeule.stl'),
         (arm, '4_arm.stl'), (ablage, '5_ablage.stl')]
meshes = {n: save(m, n) for m, n in parts}

# ---------------- Zusammenbau-Vorschau ----------------
segs = 3
vor = [unter, deckel.translate([0, 0, FUSS_H])]
z = 2.4
for i in range(segs):
    vor.append(saeule.rotate([180, 0, 0]).translate([0, 0, z + SEGMENT_L]))
    z += SEGMENT_L
top = z + 4
vor.append(arm.rotate([180, 0, 0]).translate([0, 0, top + 0.01]))
arm_unterkante = top - ARM_H
vor.append(ablage.translate([ARM_L + AL / 2 + 35, 0, arm_unterkante]))
ges = vor[0]
for m in vor[1:]: ges += m
save(ges, 'vorschau_zusammengebaut.stl')
print(f'Kamerahöhe über dem Tisch ca. {arm_unterkante:.0f} mm, Kamera ca. {ARM_L + 35 + AL - 40:.0f} mm von der Säule entfernt')
