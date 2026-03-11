var toastEl = document.querySelector('.toast');

if (toastEl && !(window.hdtSession && window.hdtSession.requiresWearableSelection)) {
    var toast = new bootstrap.Toast(toastEl);

    toast.show();

    fetch('/api/devices_portable')
        .then(res => res.json())
        .then(data => {
            document.querySelector('.toast-body').innerHTML =
                `You have been successfully connected with the wearable device: <code>${data.portable_id}</code>`;

            const toastEl = document.querySelector('.toast');
            const toast = new bootstrap.Toast(toastEl);
            toast.show();
        });
}
