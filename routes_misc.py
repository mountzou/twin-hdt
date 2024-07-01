from flask import render_template


def register_misc_routes(app):
    @app.route('/terms_and_conditions')
    def term_and_conditions():
        return render_template('terms-and-conditions.html')

    @app.route('/policy_terms/')
    def policy_terms():
        return render_template('policy-terms.html')

    @app.route('/policy_privacy/')
    def policy_privacy():
        return render_template('policy-privacy.html')
