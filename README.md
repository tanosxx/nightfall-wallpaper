# Nightfall

Живые обои для **GNOME Shell 50**: семь атмосферных сцен, библиотека в отдельном окне и переключение из верхней панели. Текущий выпуск — **v16**.

[Предпросмотр в браузере](https://tanosxx.github.io/nightfall-wallpaper/) · [Скачать релиз](https://github.com/tanosxx/nightfall-wallpaper/releases) · [Сообщить о проблеме](https://github.com/tanosxx/nightfall-wallpaper/issues)

![Ночной рубеж — одна из сцен Nightfall](assets/city.png)

Обои работают локально: браузер, интернет и учётная запись для рабочего стола не нужны. Иллюстрации созданы с помощью генеративного ИИ; движение, свет, погода и другие эффекты рассчитываются во время работы. Это сцены на основе изображений с анимацией, а не полноценные трёхмерные миры.

## Коллекция

| Сцена | Что происходит |
| --- | --- |
| **Ночной рубеж** | Дождь, транспорт, огни окон, дым и течение воды в ночном городе. |
| **Полярный сигнал** | Сияние, снег, вода, маяки и жизнь полярной базы. |
| **Дальний рубеж** | Свет, пар, механизмы и сварка на космической станции; три режима освещения. |
| **Бездна** | Подводная база, прожекторы, лифт, переходы и движение в помещениях. |
| **Ночной узел** | Дальний поезд, разноцветный трафик, сигналы, окна и пар. |
| **Город над облаками** | Облака между башнями, турбины, маяки и далёкая гроза. |
| **Пепел титанов** | Пожары, дым, горящие корабли, работа у разрушенных роботов и индикаторы экзокостюма. |

В v16 встроен **«Ночной рубеж»**, остальные сцены скачиваются отдельно из вкладки **«Каталог»**. Общий индекс, превью и пакеты хранятся на GitHub. После установки сцена работает без сети. При обновлении v15 прежняя коллекция переносится в локальную библиотеку автоматически.

На сайте можно посмотреть сцену и скачать её ZIP. В приложении откройте **Каталог → Установить из файла…**. Для новых работ доступен процесс публикации через проверяемый pull request: [формат пакета и участие сообщества](docs/SCENE-PACKS.md). Прямая отправка работы из приложения и автоматическая публикация без проверки пока отсутствуют.

## Установка готового релиза

Поддерживается GNOME Shell **50**. Установщик проверяет версию; поддержка других версий GNOME и других рабочих окружений не заявлена.

```bash
gnome-shell --version
```

Нужны `gnome-extensions`, системный Python 3 с `python3-gi`, GTK 4 и libadwaita. Установщик не устанавливает системные зависимости автоматически. Для готового релиза не нужны Node.js, Pillow, NumPy, отдельный `gjs` CLI или `glib-compile-schemas`.

1. Скачайте **`nightfall-v16-linux.tar.gz`** и `SHA256SUMS` со страницы [релиза](https://github.com/tanosxx/nightfall-wallpaper/releases).
2. В каталоге загрузки выполните:

```bash
sha256sum --check --ignore-missing SHA256SUMS
tar -xzf nightfall-v16-linux.tar.gz
cd nightfall-v16
bash install.sh --bundle ./nightfall@local.shell-extension.zip
```

Запускайте установщик **от своего пользователя, без `sudo`**. Он устанавливает расширение и значок приложения, сохраняя обычные настройки обоев.

Откройте **«Nightfall — Живые обои»** в меню приложений либо выполните:

```bash
gnome-extensions prefs nightfall@local
```

После установки или обновления GNOME может продолжать использовать прежний JavaScript из памяти. Если установщик сообщает об этом, сохраните работу, **выйдите из сеанса и войдите снова**. Переключение уже загруженных сцен нового входа не требует; установщик сам сеанс не завершает.

## Управление

- **«Установлено»** показывает локальные сцены. Выберите сцену; меню Nightfall в верхней панели позволяет быстро переключаться между ними.
- **«Каталог»** загружает общий индекс и небольшие превью. Нажмите **«Скачать»**; появившуюся сцену можно сразу выбрать. Новая версия пакета получает кнопку обновления.
- **«Удалить»** освобождает место скачанной сцены. При удалении активной сцены приложение переключается на встроенный город; встроенную сцену удалить нельзя.
- **«Установить из файла…»** принимает проверяемый ZIP-пакет сцены. Интернет при такой установке не нужен.
- **«Живые обои»** включает анимацию или возвращает обычный фон, сохраняя меню Nightfall.
- **«Пауза»** останавливает сцену. Регулятор меняет интенсивность осадков, течения, ветра или активности выбранного мира.
- Космическая станция имеет режимы рабочей смены, ночи и техобслуживания.

Скачанные сцены хранятся в `${XDG_DATA_HOME:-~/.local/share}/nightfall/scenes/`, кэш каталога и превью — в `${XDG_CACHE_HOME:-~/.cache}/nightfall/`. Удаление расширения сохраняет локальную коллекцию для повторной установки. При недоступности сети каталог показывает сохранённую копию, если она уже была загружена.

Настройки сохраняются между входами. Анимация приостанавливается при блокировке экрана и в обзоре GNOME. Движение курсора не управляет сценой.

Отключить или снова включить расширение:

```bash
gnome-extensions disable nightfall@local
gnome-extensions enable nightfall@local
```

Удалить его можно из распакованного релиза или исходников:

```bash
bash uninstall.sh
```

## Локальный предпросмотр

Из полной копии репозитория:

```bash
bash preview.sh
```

Откройте [http://127.0.0.1:8847/](http://127.0.0.1:8847/). Сервер слушает только локальный интерфейс; остановка — `Ctrl+C` в терминале. Предпросмотр использует локальные файлы, без внешних CDN.

`Space` — пауза, `F` — полный экран, `H` — скрыть управление. Его настройки сохраняются отдельно от настроек рабочего стола. Браузерный и нативный рендереры могут немного различаться; оценивать изменения нужно в обоих.

## Сборка и разработка

```bash
git clone https://github.com/tanosxx/nightfall-wallpaper.git
cd nightfall-wallpaper
bash install.sh
```

Установка из исходников дополнительно требует `gjs` и `glib-compile-schemas`. Готовые изображения, маски и атласы включены в репозиторий: для сборки не нужно заново генерировать иллюстрации или запускать графические генераторы.

Основные части проекта:

- `extension/nightfall@local/` — GJS/Cairo, меню, настройки и нативные рендереры.
- `extension/nightfall@local/scene-catalog.js` — общий каталог приложения и предпросмотра.
- `assets/` — композиции сцен и ресурсы эффектов; [описание ассетов](ASSETS.md).
- `index.html`, `library.js`, страницы сцен — браузерная библиотека и предпросмотр.
- `app/` — значок и launcher; `package-extension.py` — сборка установочного ZIP.
- `tests/`, `scripts/` — проверки и инструменты подготовки ресурсов.

Основные автоматические проверки:

```bash
bash scripts/check-source.sh
```

Проверка готового пакета без установки в текущий сеанс:

```bash
nightfall_build_dir="$(mktemp -d)"
python3 package-extension.py \
  --stage "$nightfall_build_dir/nightfall@local" \
  --archive "$nightfall_build_dir/nightfall@local.shell-extension.zip"
python3 scripts/build-scene-packs.py
python3 scripts/check-packaged-scenes.py "$nightfall_build_dir/nightfall@local"
```

Node.js нужен для тестов JavaScript, GJS/Cairo — для нативных проверок. Тест интерфейса запускается отдельно: `xvfb-run -a gjs -m tests/prefs-catalog.test.js` (GTK 4, libadwaita, Xvfb). Отдельные генераторы и проверки изображений требуют Pillow и NumPy; они не являются шагами установки. Подробнее — [CONTRIBUTING](CONTRIBUTING.md).

## Лицензия и происхождение изображений

Собственный код и материалы проекта распространяются на условиях **GPL-3.0-only** в пределах имеющихся у авторов прав. Для изображений, созданных ИИ, проект не заявляет исключительное авторское право. Условия и происхождение ресурсов: [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), [ASSETS.md](ASSETS.md).

В сохранённом экспериментальном 3D-прототипе используется Three.js под [MIT](vendor/three/LICENSE). Этот компонент не используется текущим нативным рендерером и не входит в установочный пакет расширения.

О проблемах безопасности — [SECURITY.md](SECURITY.md).

## English — quick install

Nightfall v16 provides a GitHub-hosted scene catalogue for **GNOME Shell 50**. One scene is bundled; download the others from the Catalogue tab and use them offline. Existing v15 scenes are preserved on upgrade. Download `nightfall-v16-linux.tar.gz` from [Releases](https://github.com/tanosxx/nightfall-wallpaper/releases), extract it, then run as your regular user:

```bash
cd nightfall-v16
bash install.sh --bundle ./nightfall@local.shell-extension.zip
gnome-extensions prefs nightfall@local
```

The installer requires `gnome-extensions`, system Python 3 with PyGObject, GTK 4 and libadwaita. Do not use `sudo`. Log out and back in if GNOME still holds an older extension version in memory. Run `bash uninstall.sh` from the extracted folder to uninstall.

Artwork was generated with AI tools. Project materials use GPL-3.0-only where applicable rights exist; preserved third-party notices are listed in [NOTICE.md](NOTICE.md). Individual scene downloads, updates, local ZIP import and removal are available. Community contributions use reviewed pull requests; direct in-app uploads are not implemented.
