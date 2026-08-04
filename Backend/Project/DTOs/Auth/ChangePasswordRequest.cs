using System.ComponentModel.DataAnnotations;

namespace FormRequestSystem.Project.DTOs.Auth;

public sealed class ChangePasswordRequest
{
    [Required]
    [StringLength(128, MinimumLength = 1)]
    public string CurrentPassword { get; init; } = string.Empty;

    [Required]
    [StringLength(128, MinimumLength = 8)]
    public string NewPassword { get; init; } = string.Empty;

    [Required]
    [StringLength(128, MinimumLength = 8)]
    public string ConfirmPassword { get; init; } = string.Empty;
}
