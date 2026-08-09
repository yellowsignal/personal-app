export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

const JSON_HEADERS = { "content-type": "application/json" };

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(message || `Request failed with ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  listTasks: () => fetch("/api/tasks").then((r) => parse<Task[]>(r)),
  createTask: (title: string) =>
    fetch("/api/tasks", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title }),
    }).then((r) => parse<Task>(r)),
  toggleTask: (id: string) =>
    fetch(`/api/tasks/${id}`, { method: "PATCH" }).then((r) => parse<Task>(r)),
  deleteTask: (id: string) =>
    fetch(`/api/tasks/${id}`, { method: "DELETE" }).then((r) => parse<void>(r)),
};
