using System.ComponentModel.DataAnnotations;

namespace GatePassSystem.Project.DTOs.Auth;

public sealed class LoginRequest
{
    [Required]
    [StringLength(80, MinimumLength = 2)]
    public string Username { get; init; } = string.Empty;

    [Required]
    [StringLength(128, MinimumLength = 1)]
    public string Password { get; init; } = string.Empty;
}
