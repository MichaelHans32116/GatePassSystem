// Authentication and session UI.

function togglePassword() {
            const passInput = document.getElementById('empPass');
            const eyeIcon = document.getElementById('eyeIcon');

            if (passInput.type === 'password') {
                passInput.type = 'text';
                eyeIcon.classList.remove('fa-eye');
                eyeIcon.classList.add('fa-eye-slash');
            } else {
                passInput.type = 'password';
                eyeIcon.classList.remove('fa-eye-slash');
                eyeIcon.classList.add('fa-eye');
            }
        }

function quickLogin(id, password) {
            document.getElementById('empId').value = id;
            document.getElementById('empPass').value = password;
            document.getElementById('loginForm').dispatchEvent(new Event('submit'));
        }

function handleLogin(e) {
            e.preventDefault();
            const id = document.getElementById('empId').value;
            const password = document.getElementById('empPass').value;
            const user = mockUsers.find(u => u.id === id && u.password === password);

            if (user) {
                currentUser = user;
                document.getElementById('loginView').style.opacity = '0';
                setTimeout(() => {
                    document.getElementById('loginView').classList.add('hidden');
                    document.getElementById('appView').classList.remove('hidden');
                    document.getElementById('loginView').style.opacity = '1';
                }, 500);

                document.getElementById('navUserName').innerText = user.name;
                document.getElementById('navUserRole').innerText = user.role;
                setupRoleAccess(user);
                showToast(`Signed in as ${user.name}`);
            } else {
                showToast('Invalid ID or Password.', 'error');
            }
        }

function logout() {
            currentUser = null;
            document.getElementById('appView').classList.add('hidden');
            document.getElementById('loginView').classList.remove('hidden');
            document.getElementById('loginForm').reset();
            if(window.innerWidth < 768 && !document.getElementById('sidebar').classList.contains('-translate-x-full')) {
                toggleSidebar(); // close sidebar if open on mobile
            }
        }


window.togglePassword = togglePassword;
window.quickLogin = quickLogin;
window.handleLogin = handleLogin;
window.logout = logout;
