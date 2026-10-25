Nightfall v16 добавляет общий каталог и отдельные скачиваемые сцены.

- Вкладки «Установлено» и «Каталог», скачивание, обновление и удаление сцен.
- Установка ZIP-пакета с сайта через «Каталог → Установить из файла…».
- Одна встроенная сцена и шесть дополнительных; прежняя коллекция v15 сохраняется при обновлении.
- После скачивания сцены работают без интернета.
- Общий каталог и все файлы размещены на GitHub. Для работ сообщества подготовлен формат пакета и процесс проверки через pull request.

**Установка приложения (GNOME Shell 50):** скачайте `nightfall-v16-linux.tar.gz` и `SHA256SUMS`, затем выполните от обычного пользователя:

```bash
sha256sum --check --ignore-missing SHA256SUMS
tar -xzf nightfall-v16-linux.tar.gz
cd nightfall-v16
bash install.sh --bundle ./nightfall@local.shell-extension.zip
```

После обновления может потребоваться выйти из сеанса и войти снова, чтобы GNOME загрузил новую версию расширения. Установщик сам не завершает сеанс.

`nightfall-scene-*.zip` — отдельные сцены; их устанавливают через библиотеку Nightfall. `nightfall@local.shell-extension.zip` — само расширение.

[Галерея](https://tanosxx.github.io/nightfall-wallpaper/) · [Инструкция](https://github.com/tanosxx/nightfall-wallpaper#readme) · [Формат и публикация сцен](https://github.com/tanosxx/nightfall-wallpaper/blob/main/docs/SCENE-PACKS.md)

Лицензия проекта: GPL-3.0-only. Изображения подготовлены с помощью генеративного ИИ; сведения об исходных материалах и лицензиях включены в пакеты.
