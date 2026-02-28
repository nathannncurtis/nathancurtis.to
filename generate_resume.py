#!/usr/bin/env python3
"""Generate resume PDF for Nathan Curtis portfolio site."""

from fpdf import FPDF

class ResumePDF(FPDF):
    def header(self):
        pass

    def section_heading(self, text):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 40, 45)
        self.cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(91, 159, 192)
        self.set_line_width(0.4)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(3)

    def bullet(self, text):
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(60, 60, 65)
        x = self.get_x()
        self.cell(4, 5, "-", new_x="END")
        self.multi_cell(0, 4.5, text, align="L", new_x="LMARGIN", new_y="NEXT")
        self.ln(0.5)

    def domain_block(self, title, desc):
        self.set_font("Helvetica", "B", 9.5)
        self.set_text_color(40, 40, 45)
        self.cell(0, 5, title, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(80, 80, 85)
        self.multi_cell(0, 4.5, desc, align="L", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)


pdf = ResumePDF()
pdf.set_auto_page_break(auto=True, margin=20)
pdf.add_page()
pdf.set_margins(18, 18, 18)
pdf.set_y(18)

# Name
pdf.set_font("Helvetica", "B", 22)
pdf.set_text_color(20, 20, 25)
pdf.cell(0, 10, "Nathan Curtis", new_x="LMARGIN", new_y="NEXT")

# Title
pdf.set_font("Helvetica", "", 10.5)
pdf.set_text_color(91, 159, 192)
pdf.cell(0, 6, "Process Development Specialist", new_x="LMARGIN", new_y="NEXT")

# Contact
pdf.set_font("Helvetica", "", 9)
pdf.set_text_color(100, 100, 105)
pdf.cell(0, 5, "nathan@nathancurtis.to  |  github.com/nathannncurtis  |  nathancurtis.to", new_x="LMARGIN", new_y="NEXT")
pdf.ln(5)

# Summary
pdf.section_heading("Summary")
pdf.set_font("Helvetica", "", 9.5)
pdf.set_text_color(60, 60, 65)
pdf.multi_cell(0, 4.5, (
    "Process Development Specialist operating across automation, infrastructure, "
    "production hardware, and cross-departmental workflow design. I build the tools, "
    "administer the systems they run on, maintain the hardware they depend on, and "
    "connect the workflows between them. I work across Python, PowerShell, JavaScript, "
    "Go, and PHP to solve whatever the environment puts in front of me."
), align="L", new_x="LMARGIN", new_y="NEXT")
pdf.ln(3)

# Experience
pdf.section_heading("Experience")
pdf.set_font("Helvetica", "B", 10.5)
pdf.set_text_color(40, 40, 45)
pdf.cell(0, 6, "Process Development Specialist", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("Helvetica", "I", 9)
pdf.set_text_color(100, 100, 105)
pdf.cell(0, 5, "Litigation Support Company  |  Current", new_x="LMARGIN", new_y="NEXT")
pdf.ln(3)

bullets = [
    "Design and maintain automation pipelines for document processing, OCR, file conversion, and batch imaging workflows",
    "Develop desktop applications and internal tools (PyQt5, Electron) for production operations across network shares",
    "Administer Active Directory, Group Policy, DNS/DHCP, NAS storage (RAID configuration, permissions, backups), and firewall rules",
    "Perform full maintenance kits on Kyocera production printers -- fusers, drums, feed assemblies -- and integrate hardware into imaging pipelines",
    "Build internal dashboards and data-driven interfaces (AG Grid, SQL) for stat tracking and operational visibility",
    "Diagnose and resolve cross-layer failures spanning software, infrastructure, hardware, and network",
    "Design cross-departmental workflows that reduce manual handoffs, connect siloed systems, and improve throughput",
    "Provide cross-platform support across Windows, macOS, Linux, iOS, and Android environments",
]

for b in bullets:
    pdf.bullet(b)

pdf.ln(3)

# Capability Domains
pdf.section_heading("Capability Domains")

domains = [
    ("Automation & Workflow Development",
     "Python, PowerShell, JavaScript, Go, PHP. OCR pipelines, batch processing, document classification, file conversion systems, job scheduling, desktop utilities, cross-department workflow integration."),
    ("Systems & Infrastructure",
     "Active Directory and Group Policy administration, DNS/DHCP configuration and troubleshooting, NAS deployment and storage management (RAID, permissions, backups), firewall configuration, network segmentation, SSH, cross-platform support (Windows, macOS, Linux)."),
    ("Production Hardware & Imaging",
     "Kyocera production printer diagnostics and full maintenance kits (fusers, drums, feed assemblies). Hardware integration into production workflows. Scanner configuration. Imaging pipeline troubleshooting."),
    ("Interface & Tooling Design",
     "Internal dashboards with AG Grid and inline editing. SQL-driven stat tracking and reporting. Electron apps. PyQt5 desktop tools. Configuration interfaces for non-technical users."),
    ("Technical Operations & Process Development",
     "Cross-departmental workflow design and implementation. System diagnostics across software, infrastructure, and hardware layers. Environment stabilization. Training and documentation for operational handoff."),
]

for title, desc in domains:
    pdf.domain_block(title, desc)

pdf.output("assets/resume.pdf")
print("Generated assets/resume.pdf")
