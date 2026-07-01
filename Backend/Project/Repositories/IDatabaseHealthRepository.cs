namespace FormRequestSystem.Project.Repositories;

public interface IDatabaseHealthRepository
{
    Task<bool> CanConnectAsync(CancellationToken cancellationToken = default);
}

