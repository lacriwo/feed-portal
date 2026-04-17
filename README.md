# Feed Factory (GitHub-only)

Бесплатная архитектура: `GitHub Pages + GitHub Actions`.

## Что делает проект

- Одностраничник (`index.html`) позволяет добавить/обновить проект фида.
- Конфиги хранятся в `data/projects.json`.
- GitHub Actions каждый час запускает `scripts/update_all_feeds.py`.
- Скрипт обновляет только те проекты, которым пора по интервалу (3/6/12/24 часа).
- Результат публикуется в `feeds/<slug>.xml`.

## Как включить

1. Загрузите эту папку в GitHub-репозиторий.
2. Включите Pages: `Settings -> Pages -> Deploy from a branch -> main / (root)`.
3. Убедитесь, что Actions включены и есть `Read and write permissions`.
4. Откройте сайт Pages: `https://<owner>.github.io/<repo>/`.
5. В форме укажите:
   - owner, repo
   - GitHub token с правом `Contents: Read and write`
   - параметры нового проекта (CRM URL, поля, замена, интервал, slug)
6. Нажмите "Сохранить проект".

## Результат

- Ссылка на фид: `https://<owner>.github.io/<repo>/feeds/<slug>.xml`
- Индекс с проектами: `https://<owner>.github.io/<repo>/feeds/index.json`
