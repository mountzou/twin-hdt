from flask import render_template


def register_error_routes(app):
    @app.errorhandler(401)
    def error_401(error):
        return render_template('_error/401.html'), 401

    @app.errorhandler(403)
    def error_403(error):
        return render_template('_error/403.html'), 403

    @app.errorhandler(404)
    def error_404(error):
        return render_template('_error/404.html'), 404

    @app.errorhandler(500)
    def error_500(error):
        return render_template('_error/500.html'), 500
