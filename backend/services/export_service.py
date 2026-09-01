"""
Generates a simple PDF report for a saved analysis using fpdf2.
"""
import io
from fpdf import FPDF


class ReportPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(20, 20, 20)
        self.cell(0, 12, "hirelens - Resume Match Report", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(200, 200, 200)
        self.line(10, 22, 200, 22)
        self.ln(6)

    def section_title(self, title):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(30, 30, 30)
        self.ln(3)
        self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(60, 60, 60)
        self.set_font("Helvetica", "", 11)

    def bullet_list(self, items, empty_message="None"):
        if not items:
            self.cell(0, 6, f"- {empty_message}", new_x="LMARGIN", new_y="NEXT")
            return
        for item in items:
            self.multi_cell(0, 6, f"- {item}", new_x="LMARGIN", new_y="NEXT")


def generate_report_pdf(analysis: dict) -> bytes:
    pdf = ReportPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, f"Resume file: {analysis.get('resume_filename', 'N/A')}", new_x="LMARGIN", new_y="NEXT")
    if analysis.get("job_title"):
        pdf.cell(0, 7, f"Job title: {analysis.get('job_title')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f"Generated: {analysis.get('created_at', '')}", new_x="LMARGIN", new_y="NEXT")

    pdf.section_title(f"Match Score: {analysis.get('match_score', 0)}%")

    pdf.section_title("Required Skills (from Job Description)")
    pdf.bullet_list(analysis.get("required_skills", []) or analysis.get("jd_skills", []))

    pdf.section_title("Matched Skills")
    pdf.bullet_list(analysis.get("matched_skills", []))

    pdf.section_title("Missing Skills")
    pdf.bullet_list(analysis.get("missing_skills", []))

    recommendations = analysis.get("recommendations", [])
    pdf.section_title("Learning Recommendations")
    if not recommendations:
        pdf.cell(0, 6, "- None", new_x="LMARGIN", new_y="NEXT")
    else:
        for rec in recommendations:
            if isinstance(rec, dict):
                line = f"{rec.get('skill')}: {rec.get('title')} ({rec.get('url')})"
            else:
                line = str(rec)
            pdf.multi_cell(0, 6, f"- {line}", new_x="LMARGIN", new_y="NEXT")

    output = pdf.output(dest="S")
    if isinstance(output, str):
        output = output.encode("latin-1")
    return bytes(output)
