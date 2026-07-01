using FormRequestSystem.Project.Models;
using Microsoft.Extensions.Options;

namespace FormRequestSystem.Project.Services;

public sealed class JwtOptionsValidator : IValidateOptions<JwtOptions>
{
    public ValidateOptionsResult Validate(string? name, JwtOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.Issuer))
        {
            return ValidateOptionsResult.Fail("Jwt:Issuer is required.");
        }

        if (string.IsNullOrWhiteSpace(options.Audience))
        {
            return ValidateOptionsResult.Fail("Jwt:Audience is required.");
        }

        if (string.IsNullOrWhiteSpace(options.Key) || options.Key.Length < 32)
        {
            return ValidateOptionsResult.Fail("Jwt:Key must contain at least 32 characters.");
        }

        return ValidateOptionsResult.Success;
    }
}

