from flask import render_template


def register_terms_routes(app):
    @app.route('/terms-and-conditions')
    @app.route('/terms_and_conditions')
    def term_and_conditions():
        return render_template('_terms/terms-and-conditions.html')

    @app.route('/policy-terms/')
    @app.route('/policy_terms/')
    def policy_terms():
        return render_template('_terms/policy-terms.html')

    @app.route('/policy-privacy/')
    @app.route('/policy_privacy/')
    def policy_privacy():
        return render_template('_terms/policy-privacy.html')
