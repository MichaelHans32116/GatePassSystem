using System;
using System.Data;
using Dapper;

namespace FormRequestSystem.Api.Infrastructure.Data;

public class SqlDateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override void SetValue(IDbDataParameter parameter, DateOnly date)
    {
        parameter.Value = date.ToDateTime(new TimeOnly(0, 0));
        parameter.DbType = DbType.Date;
    }

    public override DateOnly Parse(object value)
    {
        return DateOnly.FromDateTime((DateTime)value);
    }
}
