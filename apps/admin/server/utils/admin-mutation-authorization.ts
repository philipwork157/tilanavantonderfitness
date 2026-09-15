interface AdminMutationAuthorizationDependencies<TEvent, TSession> {
  enforceSameOrigin: (event: TEvent) => void;
  requireAdmin: (event: TEvent) => Promise<TSession>;
}

export async function authorizeAdminMutation<TEvent, TSession>(
  event: TEvent,
  dependencies: AdminMutationAuthorizationDependencies<TEvent, TSession>,
): Promise<TSession> {
  dependencies.enforceSameOrigin(event);
  return dependencies.requireAdmin(event);
}
