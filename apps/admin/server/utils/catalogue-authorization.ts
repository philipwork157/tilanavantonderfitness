interface CatalogueMutationAuthorizationDependencies<TEvent, TSession> {
  enforceSameOrigin: (event: TEvent) => void;
  requireAdmin: (event: TEvent) => Promise<TSession>;
}

export async function authorizeCatalogueMutation<TEvent, TSession>(
  event: TEvent,
  dependencies: CatalogueMutationAuthorizationDependencies<TEvent, TSession>,
): Promise<TSession> {
  dependencies.enforceSameOrigin(event);
  return dependencies.requireAdmin(event);
}
