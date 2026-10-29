export interface Env { DB: D1Database }
export interface AppUser { id: string; username: string; displayName: string; role: string; permissions: string[] }
export interface Variables { user?: AppUser }
