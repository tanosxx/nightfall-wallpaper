# Scene assets

The seven scene compositions were generated with AI tools for Nightfall. Their
runtime animation is implemented in the source code; the PNG files are not
pre-rendered videos.

| Scene | Source composition | Additional runtime data |
| --- | --- | --- |
| Ночной рубеж | `assets/city.png` | Scene data and effects in JavaScript |
| Полярный сигнал | `assets/polar.png` | Polar data, water and aurora effects |
| Дальний рубеж | `assets/station.png` | `assets/station-relief/`, `assets/station-native/` |
| Бездна | `assets/abyss.png` | `assets/abyss-native/` |
| Ночной узел | `assets/junction.png` | `assets/junction-native/` |
| Город над облаками | `assets/cloudcity.png` | `assets/cloudcity-native/` |
| Пепел титанов | `assets/titans.png` | `assets/titans/` |

Derived assets include masks, light maps, normal/depth approximations and smoke
atlases. Keep these files together with the source code when distributing a
scene. Ready-to-use runtime assets are committed so that installing or building
Nightfall does not require an image-generation service.

Some development generators require NumPy, Pillow or intermediate extracted
data. They are not installation steps. The supported package build consumes the
committed runtime assets directly.

Licensing and third-party notices are described in [NOTICE.md](NOTICE.md).
