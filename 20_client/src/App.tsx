import { useEffect, useMemo, useState } from "react";
import { api, type Task } from "./api";
import "./App.css";

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTasks()
      .then(setTasks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const remaining = useMemo(() => tasks.filter((t) => !t.done).length, [tasks]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setError(null);
    try {
      const created = await api.createTask(value);
      setTasks((prev) => [created, ...prev]);
      setTitle("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggle(id: string) {
    try {
      const updated = await api.toggleTask(id);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1>personal-app</h1>
        <p className="app__subtitle">
          A full-stack starter · React + Vite · Express API
        </p>
      </header>

      <section className="card">
        <form className="task-form" onSubmit={addTask}>
          <input
            className="task-form__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            aria-label="Task title"
          />
          <button className="task-form__button" type="submit">
            Add
          </button>
        </form>

        {error && <p className="banner banner--error">{error}</p>}

        {loading ? (
          <p className="muted">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="muted">No tasks yet. Add your first one above.</p>
        ) : (
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id} className="task">
                <label className="task__label">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => toggle(task.id)}
                  />
                  <span className={task.done ? "task__title task__title--done" : "task__title"}>
                    {task.title}
                  </span>
                </label>
                <button
                  className="task__delete"
                  onClick={() => remove(task.id)}
                  aria-label={`Delete ${task.title}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="app__footer">
        {tasks.length > 0 && <span>{remaining} remaining</span>}
      </footer>
    </main>
  );
}
