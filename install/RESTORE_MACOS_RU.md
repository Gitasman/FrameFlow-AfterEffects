# Восстановление на macOS

Закройте AE. В Finder: Go → Go to Folder → `~/Library/Application Support/FrameFlow/backups`.
Откройте папку последней успешной установки. Файл `extension-state.txt` показывает, была ли установлена старая CEP-версия.

1. В `~/Library/Application Support/Adobe/CEP/extensions` переместите только `com.frameflow.ae` в резервную папку вне `extensions`.
2. Если в резервной копии есть папка `extension`, перенесите её в `extensions` с именем `com.frameflow.ae`.
3. При необходимости восстановите `PlayerDebugMode` домена `com.adobe.CSXS.12` по `debug-state.txt`, `debug-type.txt`, `debug-value.txt`. Не меняйте его, если после установки вы перенастроили CEP для других панелей. Отсутствующее прежде значение удаляется через `defaults delete com.adobe.CSXS.12 PlayerDebugMode`; сохранённая строка возвращается через `defaults write com.adobe.CSXS.12 PlayerDebugMode -string <сохранённое_значение>`; для integer/boolean используйте соответствующий тип.

Настройки FrameFlow в локальном хранилище и проекты AE не удаляются. ScriptUI 1.4 этим установщиком не затрагивается.
