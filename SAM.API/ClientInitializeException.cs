/* Copyright (c) 2024 Rick (rick 'at' gibbed 'dot' us)
 *
 * This software is provided 'as-is', without any express or implied
 * warranty. In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 * 1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would
 *    be appreciated but is not required.
 *
 * 2. Altered source versions must be plainly marked as such, and must not
 *    be misrepresented as being the original software.
 *
 * 3. This notice may not be removed or altered from any source
 *    distribution.
 */
using System;

namespace SAM.API
{
    public class ClientInitializeException : Exception
    {
        public readonly ClientInitializeFailure Failure;

        public ClientInitializeException(ClientInitializeFailure failure)
        {
            this.Failure = failure;
        }

        public ClientInitializeException(ClientInitializeFailure failure, string message)
            : base(message)
        {
            this.Failure = failure;
        }

        public ClientInitializeException(ClientInitializeFailure failure, string message, Exception innerException)
            : base(message, innerException)
        {
            this.Failure = failure;
        }

        /// <summary>
        /// Gets the error code string for this initialization failure
        /// </summary>
        public string GetErrorCode() => Failure switch
        {
            ClientInitializeFailure.AppIdMismatch => "app_id_mismatch",
            ClientInitializeFailure.GetInstallPath => "steam_install_path_failed",
            ClientInitializeFailure.Load => "steam_load_failed",
            ClientInitializeFailure.CreateSteamClient => "steam_client_creation_failed",
            ClientInitializeFailure.CreateSteamPipe => "steam_pipe_creation_failed",
            ClientInitializeFailure.ConnectToGlobalUser => "steam_connect_failed",
            _ => "steam_initialization_failed"
        };

        /// <summary>
        /// Gets the appropriate HTTP status code for this failure
        /// </summary>
        public int GetHttpStatusCode() => Failure switch
        {
            ClientInitializeFailure.AppIdMismatch => 409,  // Conflict - recoverable
            ClientInitializeFailure.ConnectToGlobalUser => 503,  // Steam not running
            ClientInitializeFailure.GetInstallPath => 503,  // Steam not installed
            ClientInitializeFailure.Load => 503,  // Steam not available
            ClientInitializeFailure.CreateSteamClient => 503,  // Steam not available
            ClientInitializeFailure.CreateSteamPipe => 503,  // Steam not available
            _ => 500  // Internal server error
        };

        /// <summary>
        /// Returns true only if this failure can be recovered by disposing and retrying
        /// </summary>
        public bool IsRecoverable() => Failure == ClientInitializeFailure.AppIdMismatch;
    }
}
