using System.Data.Common;

namespace FormRequestSystem.Project.Repositories;

public interface IDatabaseConnectionFactory
{
    ValueTask<DbConnection> OpenConnectionAsync(CancellationToken cancellationToken = default);
}

