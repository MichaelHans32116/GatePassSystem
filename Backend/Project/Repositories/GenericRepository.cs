namespace GatePassSystem.Project.Repositories;

// Entity-specific repositories inherit this marker base as shared CRUD conventions
// are introduced. Workflow writes intentionally remain explicit and transactional.
public abstract class GenericRepository<TEntity, TKey> : IGenericRepository<TEntity, TKey>
{
    public abstract Task<TEntity?> GetByIdAsync(
        TKey id,
        CancellationToken cancellationToken = default);

    public abstract Task<IReadOnlyList<TEntity>> GetAllAsync(
        CancellationToken cancellationToken = default);
}
