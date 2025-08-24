import type { UserState } from '../types';

/**
 * State management service for handling user states during conversations
 */
export class StateService {
  private userStates: Map<number, UserState> = new Map();

  /**
   * Gets user state
   */
  getState(userId: number): UserState | null {
    const state = this.userStates.get(userId);
    if (state && state.expireAt && Date.now() > state.expireAt) {
      this.userStates.delete(userId);
      return null;
    }
    return state || null;
  }

  /**
   * Sets user state
   */
  setState(userId: number, state: UserState): void {
    this.userStates.set(userId, state);
  }

  /**
   * Deletes user state
   */
  deleteState(userId: number): void {
    this.userStates.delete(userId);
  }

  /**
   * Gets user state (alias for compatibility)
   */
  getUserState(userId: number): UserState | null {
    return this.getState(userId);
  }

  /**
   * Sets user state (alias for compatibility)
   */
  setUserState(userId: number, state: UserState): void {
    this.setState(userId, state);
  }

  /**
   * Clears user state (alias for compatibility)
   */
  clearUserState(userId: number): void {
    this.deleteState(userId);
  }

  /**
   * Updates specific state property
   */
  updateUserState(userId: number, updates: Partial<UserState>): void {
    const currentState = this.getState(userId);
    const newState: UserState = {
      name: updates.name || currentState?.name || '',
      data: updates.data !== undefined ? updates.data : currentState?.data,
      expireAt: updates.expireAt !== undefined ? updates.expireAt : currentState?.expireAt
    };
    this.setState(userId, newState);
  }

  /**
   * Checks if user has pending state
   */
  hasPendingState(userId: number): boolean {
    return this.userStates.has(userId);
  }
}