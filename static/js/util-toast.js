var toastEl = document.querySelector('.toast');
var toast = new bootstrap.Toast(toastEl);

toast.show();

fetch('/api/devices_portable')
    .then(res => res.json())
    .then(data => {
        document.querySelector('.toast-body').innerHTML =
            `You have been successfully connected with the portable device: <code>${data.portable_id}</code>`;

        const toastEl = document.querySelector('.toast');
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    });