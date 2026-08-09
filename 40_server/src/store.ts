import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

/**
 * A tiny persistent task store backed by a JSON file. Kept dependency-free on
 * purpose so the starter app runs end-to-end without any external database.
 */
export class TaskStore {
  private tasks: Task[] = [];

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    if (existsSync(this.filePath)) {
      try {
        this.tasks = JSON.parse(readFileSync(this.filePath, "utf8")) as Task[];
        return;
      } catch {
        // Corrupt or empty file: start fresh rather than crashing the server.
        this.tasks = [];
      }
    }
    this.tasks = [];
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.tasks, null, 2));
  }

  list(): Task[] {
    return [...this.tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  create(title: string): Task {
    const task: Task = {
      id: randomUUID(),
      title,
      done: false,
      createdAt: new Date().toISOString(),
    };
    this.tasks.push(task);
    this.persist();
    return task;
  }

  toggle(id: string): Task | undefined {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return undefined;
    task.done = !task.done;
    this.persist();
    return task;
  }

  remove(id: string): boolean {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.id !== id);
    if (this.tasks.length === before) return false;
    this.persist();
    return true;
  }
}
